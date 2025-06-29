import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Header from "./Header";
import Main from "./Main";
import Footer from "./Footer";

export default function GravityScene() {
  const mountRef = useRef(null);
  const loadedModelRef = useRef(null);
  const spawnIntervalRef = useRef(null);
  const basketMeshRef = useRef(null);
  const basketBodyRef = useRef(null);
  const messageRef = useRef(null);
  const sunLightRef = useRef(null);
  const sunMeshRef = useRef(null);
  const selectedBodyRef = useRef(null);
  const currentSunIntensityRef = useRef(1);
  const currentSunEmissiveIntensityRef = useRef(2.0);
  const isCreatingBasketRef = useRef(false);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      74
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
    });

    const groundMaterial = new CANNON.Material("ground");
    const appleMaterial = new CANNON.Material("apple");
    const basketMaterial = new CANNON.Material("basket");

    const groundAppleContactMaterial = new CANNON.ContactMaterial(
      groundMaterial,
      appleMaterial,
      {
        friction: 0.4,
        restitution: 0.2,
      }
    );
    world.addContactMaterial(groundAppleContactMaterial);

    const appleBasketContactMaterial = new CANNON.ContactMaterial(
      appleMaterial,
      basketMaterial,
      {
        friction: 0.3,
        restitution: 0.2,
      }
    );
    world.addContactMaterial(appleBasketContactMaterial);

    const basketGroundContactMaterial = new CANNON.ContactMaterial(
      basketMaterial,
      groundMaterial,
      {
        friction: 0.1,
        restitution: 0.1,
      }
    );
    world.addContactMaterial(basketGroundContactMaterial);

    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      position: new CANNON.Vec3(0, -5, 0),
      material: groundMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    const groundGeo = new THREE.PlaneGeometry(150, 100, 1, 100);

    const blue = new THREE.Color(0xa6d9e0);
    const yellow = new THREE.Color(0xfcfdb4);

    const colors = [];

    const totalRows = 101;
    const blueDominanceStart = 0.3;

    for (let row = 0; row < totalRows; row++) {
      const tBase = row / (totalRows - 1);
      let tAdjusted;
      if (tBase < blueDominanceStart) {
        tAdjusted = tBase / blueDominanceStart;
      } else {
        tAdjusted = 1 + (tBase - blueDominanceStart) / (1 - blueDominanceStart);
        tAdjusted = Math.min(tAdjusted, 1);
      }
      const color = yellow.clone().lerp(blue, tAdjusted);
      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);
    }

    groundGeo.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3)
    );

    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    ground.receiveShadow = true;
    scene.add(ground);

    const frontBoxes = [];

    const BASKET_SCALE_FACTOR = 4;
    const wallThicknessMultiplier = 0.4;
    const floorThicknessMultiplier = 0.4;
    const initialBasketPosition = new CANNON.Vec3(
      0,
      groundBody.position.y + 2.5,
      -16
    );

    const createBasket = async () => {
      if (isCreatingBasketRef.current) return;
      isCreatingBasketRef.current = true;

      const basketLoader = new GLTFLoader();
      try {
        const gltf = await basketLoader.loadAsync("/cesto.glb");
        const cestoModel = gltf.scene;
        cestoModel.scale.set(
          BASKET_SCALE_FACTOR,
          BASKET_SCALE_FACTOR,
          BASKET_SCALE_FACTOR
        );

        const bbox = new THREE.Box3().setFromObject(cestoModel);
        const visualModelWidth = bbox.max.x - bbox.min.x;
        const visualModelHeight = bbox.max.y - bbox.min.y;
        const visualModelDepth = bbox.max.z - bbox.min.z;

        const actualBasketHeight = visualModelHeight;

      const newBasketBody = new CANNON.Body({
    mass: 50,
    type: CANNON.Body.DYNAMIC,
    position: initialBasketPosition.clone(),
    material: basketMaterial,
    linearDamping: 0.5,
    angularDamping: 0.5,
    // Ajuste aqui:
    // Tente usar a espessura da parede ou o raio de uma maçã,
    // ou um valor pequeno que faça sentido para colisões precisas.
    ccdSweptSphereRadius: 0.6, // Raio de uma maçã (approx) ou espessura da parede * 0.5
    ccdMotionThreshold: 0.1 // O objeto precisa se mover pelo menos 0.1 unidades para ativar o CCD
});
        newBasketBody.userData = { name: "basket", applesInBasket: 0 };

        const baseRadius = Math.max(visualModelWidth, visualModelDepth) / 2;
        const wallHeight = actualBasketHeight;
        const baseThickness = floorThicknessMultiplier * BASKET_SCALE_FACTOR;

        const floorShape = new CANNON.Cylinder(
          baseRadius,
          baseRadius,
          baseThickness,
          16
        );
        newBasketBody.addShape(
          floorShape,
          new CANNON.Vec3(0, -actualBasketHeight / 2 + baseThickness / 2, 0)
        );

        const numWallSegments = 16;
        const angleStep = (Math.PI * 2) / numWallSegments;
        const wallRadius =
          baseRadius - (wallThicknessMultiplier * BASKET_SCALE_FACTOR) / 2;
        const segmentLength = (baseRadius * 2 * Math.PI) / numWallSegments;

        for (let i = 0; i < numWallSegments; i++) {
          const angle = i * angleStep;
          const wallX = Math.cos(angle) * wallRadius;
          const wallZ = Math.sin(angle) * wallRadius;
          const wallRotation = new CANNON.Quaternion();
          wallRotation.setFromEuler(0, angle, 0);

          const wallSegmentShape = new CANNON.Box(
            new CANNON.Vec3(
              (wallThicknessMultiplier * BASKET_SCALE_FACTOR) / 2,
              wallHeight / 2.1,
              segmentLength / 2
            )
          );
          newBasketBody.addShape(
            wallSegmentShape,
            new CANNON.Vec3(wallX, 0, wallZ),
            wallRotation
          );
        }

        world.addBody(newBasketBody);
        basketBodyRef.current = newBasketBody;
        basketMeshRef.current = cestoModel;

        newBasketBody.addEventListener("collide", (e) => {
          if (e.body.userData && e.body.userData.name === "apple") {
            const appleBody = e.body;
            const basketCenter = newBasketBody.position;
            const applePosition = appleBody.position;

            const distanceX = Math.abs(applePosition.x - basketCenter.x);
            const distanceZ = Math.abs(applePosition.z - basketCenter.z);

            const safeBasketRadius =
              baseRadius -
              (wallThicknessMultiplier * BASKET_SCALE_FACTOR) / 2 +
              .5;
            const isInsideBasketHorizontally =
              distanceX < safeBasketRadius && distanceZ < safeBasketRadius;
            const isInsideBasketVertically =
              applePosition.y > basketCenter.y - wallHeight / 2 &&
              applePosition.y < basketCenter.y + wallHeight / 2;

            if (
              isInsideBasketHorizontally &&
              isInsideBasketVertically &&
              !appleBody.userData.inBasket
            ) {
              appleBody.userData.inBasket = true;
              newBasketBody.userData.applesInBasket =
                (newBasketBody.userData.applesInBasket || 0) + 1;
              console.log(
                `Maçãs na cesta: ${newBasketBody.userData.applesInBasket}`
              );
              if (newBasketBody.userData.applesInBasket >= 3) {
                showMessage("Leve o cesto até o sol");
              }
            }
          }
        });

        cestoModel.rotation.y += Math.PI / 3;

        cestoModel.receiveShadow = true;
        cestoModel.castShadow = true;

        cestoModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(cestoModel);
        isCreatingBasketRef.current = false;
        
      } catch (error) {
        console.error("Erro ao carregar o modelo GLTF (cesto.glb):", error);
        isCreatingBasketRef.current = false;
      }
    };

    createBasket();
    isCreatingBasketRef.current = false;
    console.log(isCreatingBasketRef)

    const gridSize = 100;
    const divisions = 30;
    const color1 = 0xe7e97e;
    const color2 = 0xe7e97e;

    const gridHelperXZ = new THREE.GridHelper(
      gridSize,
      divisions,
      color1,
      color2
    );
    gridHelperXZ.position.y = -5;
    scene.add(gridHelperXZ);

    const loader = new GLTFLoader();
    loader.load(
      "/apple.glb",
      (gltf) => {
        loadedModelRef.current = gltf.scene;
        loadedModelRef.current.scale.set(0.2, 0.2, 0.2);
        loadedModelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const spawnFrontObject = () => {
          if (!loadedModelRef.current) {
            return;
          }
          const mesh = loadedModelRef.current.clone();
          mesh.position.set((Math.random() - 0.5) * 10, 10, 2);
          scene.add(mesh);

          const body = new CANNON.Body({
            mass: 14,
            material: appleMaterial,
            linearDamping: 0.3,
            angularDamping: 0.1,
            shape: new CANNON.Sphere(0.6), // O raio da sua esfera é 0.6
            // Adicionando as propriedades de CCD aqui:
            ccdSweptSphereRadius: 0.6, // Use o próprio raio da maçã para o CCD
            ccdMotionThreshold: 0.1, // Ativa o CCD se a maçã se mover mais de 0.1 unidades por passo
          });
          body.position.copy(mesh.position);
          body.userData = { name: "apple", inBasket: false };
          world.addBody(body);
 
          frontBoxes.push({ mesh, body });
        };
        spawnFrontObject();
        spawnIntervalRef.current = setInterval(spawnFrontObject, 5000);
      },
      undefined,
      (error) => {
        console.error("Erro ao carregar o modelo GLTF (apple.glb):", error);
      }
    );

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(
      0xffd700,
      currentSunIntensityRef.current
    );
    directionalLight.position.set(0, 15, -40);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);
    sunLightRef.current = directionalLight;

    const sunGeometry = new THREE.SphereGeometry(5, 32, 16, 0, Math.PI);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xfcfdb4,
      emissive: 0xffd700,
      emissiveIntensity: currentSunEmissiveIntensityRef.current,
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.copy(directionalLight.position);
    sun.position.y = -4;
    sun.position.z = -50;
    scene.add(sun);
    sunMeshRef.current = sun;

    camera.position.z = 10;
    camera.position.y = 2;

    let selectedObject = null;
    let dragDistance = 0;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const dragStrength = 500;
    const keyboardMoveSpeed = 0.2;

    const getClientCoords = (event) => {
      if (event.touches && event.touches.length > 0) {
        return {
          clientX: event.touches[0].clientX,
          clientY: event.touches[0].clientY,
        };
      }
      return { clientX: event.clientX, clientY: event.clientY };
    };

    const onPointerDown = (event) => {
      const { clientX, clientY } = getClientCoords(event);
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const meshesToIntersect = frontBoxes.map((item) => item.mesh);
      if (basketMeshRef.current) {
        meshesToIntersect.push(basketMeshRef.current);
      }

      const intersects = raycaster.intersectObjects(meshesToIntersect, true);

      if (intersects.length > 0) {
        let intersectedObject = intersects[0].object;
        let found = null;

        while (intersectedObject) {
          found = frontBoxes.find(({ mesh }) => mesh === intersectedObject);
          if (found) {
            selectedObject = found.mesh;
            selectedBodyRef.current = found.body;
            break;
          }
          if (
            basketMeshRef.current &&
            intersectedObject.uuid === basketMeshRef.current.uuid
          ) {
            selectedObject = basketMeshRef.current;
            selectedBodyRef.current = basketBodyRef.current;
            break;
          }
          if (intersectedObject.parent) {
            intersectedObject = intersectedObject.parent;
          } else {
            break;
          }
        }

        if (selectedObject && selectedBodyRef.current) {
          dragDistance = camera.position.distanceTo(selectedObject.position);
          if (event.type === "touchstart") {
            event.preventDefault();
          }
        }
      }
    };

    const onPointerMove = (event) => {
      if (!selectedObject || !selectedBodyRef.current) return;
      const { clientX, clientY } = getClientCoords(event);
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const targetPoint = new THREE.Vector3();
      raycaster.ray.at(dragDistance, targetPoint);

      if (targetPoint) {
        const forceVector = new CANNON.Vec3(
          targetPoint.x - selectedBodyRef.current.position.x,
          targetPoint.y - selectedBodyRef.current.position.y,
          targetPoint.z - selectedBodyRef.current.position.z
        );

        if (
          selectedBodyRef.current.userData &&
          selectedBodyRef.current.userData.name === "apple"
        ) {
          selectedBodyRef.current.applyForce(
            forceVector.scale(dragStrength),
            new CANNON.Vec3(0, 0, 0)
          );
        } else if (
          selectedBodyRef.current.userData &&
          selectedBodyRef.current.userData.name === "basket"
        ) {
          selectedBodyRef.current.applyForce(
            forceVector.scale(dragStrength * 2),
            new CANNON.Vec3(0, 0, 0)
          );
        }
      }
      if (event.type === "touchmove") {
        event.preventDefault();
      }
    };

    const onPointerUp = () => {
      selectedObject = null;
      selectedBodyRef.current = null;
    };

    const onKeyDown = (event) => {
      if (!basketBodyRef.current || isCreatingBasketRef.current) return;

      const currentPosition = basketBodyRef.current.position;
      let newPosition = new CANNON.Vec3(
        currentPosition.x,
        currentPosition.y,
        currentPosition.z
      );

      switch (event.key) {
        case "ArrowUp":
          newPosition.z -= keyboardMoveSpeed;
          break;
        case "ArrowDown":
          newPosition.z += keyboardMoveSpeed;
          break;
        case "ArrowLeft":
          newPosition.x -= keyboardMoveSpeed;
          break;
        case "ArrowRight":
          newPosition.x += keyboardMoveSpeed;
          break;
        case " ":
          newPosition.y += keyboardMoveSpeed;
          break;
        case "Shift":
          newPosition.y -= keyboardMoveSpeed;
          break;
        default:
          return;
      }

      basketBodyRef.current.position.copy(newPosition);
      basketBodyRef.current.velocity.set(0, 0, 0);
      basketBodyRef.current.angularVelocity.set(0, 0, 0);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    window.addEventListener("touchstart", onPointerDown, { passive: false });
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);

    const showMessage = (text) => {
      if (!messageRef.current) {
        messageRef.current = document.createElement("div");
        messageRef.current.style.position = "absolute";
        messageRef.current.style.top = "50px";
        messageRef.current.style.left = "50%";
        messageRef.current.style.transform = "translateX(-50%)";
        messageRef.current.style.background = "rgba(0, 0, 0, 0.7)";
        messageRef.current.style.color = "white";
        messageRef.current.style.padding = "10px 20px";
        messageRef.current.style.borderRadius = "5px";
        messageRef.current.style.zIndex = "100";
        messageRef.current.style.fontSize = "24px";
        messageRef.current.style.opacity = "0";
        messageRef.current.style.transition = "opacity 0.5s";
        document.body.appendChild(messageRef.current);
      }
      messageRef.current.textContent = text;
      messageRef.current.style.opacity = "1";

      setTimeout(() => {
        messageRef.current.style.opacity = "0";
      }, 3000);
    };
    

    const animate = () => {
      requestAnimationFrame(animate);
      world.step(1 / 60);

      frontBoxes.forEach(({ mesh, body }) => {
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
      });

      if (
        basketMeshRef.current &&
        basketBodyRef.current &&
        !isCreatingBasketRef.current
      ) {
        basketMeshRef.current.position.copy(basketBodyRef.current.position);
        basketMeshRef.current.quaternion.copy(basketBodyRef.current.quaternion);

        if (basketBodyRef.current.userData.applesInBasket >= 3) {
          const distanceToSun = basketBodyRef.current.position.distanceTo(
            new CANNON.Vec3(sun.position.x, sun.position.y, sun.position.z)
          );
           if (distanceToSun < 1.5) {
      if (basketMeshRef.current) {
        scene.remove(basketMeshRef.current);
        console.log("estou removendo o mesh")
        console.log(basketMeshRef.current)
        // ...
        basketMeshRef.current = null;
      }
      if (basketBodyRef.current) {
        world.removeBody(basketBodyRef.current);
         console.log("estou removendo o corpo ")
         console.log(basketBodyRef.current)
        basketBodyRef.current = null;
      }

      currentSunIntensityRef.current += 1;
      currentSunEmissiveIntensityRef.current += 1;

      if (sunLightRef.current) {
        sunLightRef.current.intensity = currentSunIntensityRef.current;
      }
      if (sunMeshRef.current && sunMeshRef.current.material) {
        sunMeshRef.current.material.emissiveIntensity = currentSunEmissiveIntensityRef.current;
      }

     isCreatingBasketRef.current = false;
      createBasket(); // ✅ Esta linha deve ser chamada com sucesso

      // Limpar as maçãs
      frontBoxes.forEach(({ mesh, body }) => {
        scene.remove(mesh);
        world.removeBody(body);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(material => material.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      frontBoxes.length = 0;
      hideMessage();
    
          }
        }
      }

      renderer.render(scene, camera);
    };

    const hideMessage = () => {
      if (messageRef.current) {
        messageRef.current.style.opacity = "0";
      }
    };

    animate();
    

    return () => {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current); // Corrected this line
      }

      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);

      if (
        mountRef.current &&
        renderer.domElement &&
        mountRef.current.contains(renderer.domElement)
      ) {
        mountRef.current.removeChild(renderer.domElement);
      }

      const childrenToRemove = [...scene.children];
      childrenToRemove.forEach((child) => {
        scene.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      renderer.dispose();

      while (world.bodies.length > 0) {
        world.removeBody(world.bodies[0]);
      }
      if (messageRef.current && document.body.contains(messageRef.current)) {
        document.body.removeChild(messageRef.current);
        messageRef.current = null;
      }
      isCreatingBasketRef.current = false;
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        ref={mountRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
        }}
      />
      <Header />
      <Main />
      <Footer />
    </div>
  );
}
