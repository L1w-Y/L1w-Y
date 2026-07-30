(() => {
  "use strict";

  const canvas = document.querySelector("#space");
  const fallback = document.querySelector("#fallback");
  const coordinates = document.querySelector("#coordinates");
  const fpsLabel = document.querySelector("#fps");
  const gravityInput = document.querySelector("#gravity");
  const speedInput = document.querySelector("#speed");
  const resetButton = document.querySelector("#reset");
  const orbitButton = document.querySelector("#orbitMode");

  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance"
  });

  if (!gl) {
    fallback.hidden = false;
    return;
  }

  const vertexSource = `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uYaw;
    uniform float uPitch;
    uniform float uZoom;
    uniform float uGravity;
    uniform float uSpeed;

    #define PI 3.14159265359

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x),
        f.y
      );
    }

    mat2 rotate2d(float a) {
      float s = sin(a);
      float c = cos(a);
      return mat2(c, -s, s, c);
    }

    vec3 starField(vec2 p, float time) {
      vec3 color = vec3(0.0);
      for (int index = 0; index < 3; index++) {
        float layer = float(index);
        float scale = 82.0 + layer * 57.0;
        vec2 cell = p * scale + vec2(time * (.006 + layer * .003), layer * 19.7);
        vec2 id = floor(cell);
        vec2 gv = fract(cell) - .5;
        float rnd = hash21(id);
        float star = smoothstep(.075, 0.0, length(gv));
        star *= smoothstep(.985 - layer * .002, 1.0, rnd);
        float shimmer = .55 + .45 * sin(time * (1.3 + rnd * 2.4) + rnd * 20.0);
        vec3 tint = mix(vec3(.45, .58, 1.0), vec3(1.0, .73, .46), hash21(id + 8.4));
        color += tint * star * shimmer * (1.0 + layer * .35);
      }
      return color;
    }

    void main() {
      vec2 frag = gl_FragCoord.xy;
      vec2 p = (frag * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
      p /= uZoom;

      float cameraAngle = uYaw * .18;
      p = rotate2d(cameraAngle) * p;
      p.y += uPitch * .08;

      float r = length(p);
      float lens = uGravity * .13 / max(r, .075);
      float theta = atan(p.y, p.x);
      vec2 warped = vec2(cos(theta + lens), sin(theta + lens)) * (r + lens * .08);

      vec3 color = vec3(.0015, .0025, .008);
      color += starField(warped * 1.18, uTime);

      float horizonRadius = .275 * uGravity;
      float photonRadius = horizonRadius + .075;
      float photonRing = exp(-abs(r - photonRadius) * 92.0);
      color += vec3(1.0, .58, .25) * photonRing * 1.65;

      float tilt = .20 + .055 * cos(uPitch);
      vec2 diskP = vec2(p.x, p.y / tilt);
      diskP = rotate2d(-cameraAngle * .42) * diskP;
      float diskR = length(diskP);
      float diskA = atan(diskP.y, diskP.x);

      float inner = .42 * uGravity;
      float outer = 1.15 * uGravity;
      float diskMask = smoothstep(inner, inner + .08, diskR) * (1.0 - smoothstep(outer - .18, outer, diskR));

      float flow = diskA * 7.0 - log(max(diskR, .01)) * 18.0 - uTime * uSpeed * 2.8;
      float turbulence = noise(vec2(flow * .32, diskR * 17.0 + uTime * uSpeed * .42));
      turbulence = pow(turbulence, 1.45);

      float centerBand = exp(-abs(p.y) * 9.0 / max(diskR, .25));
      float diskIntensity = diskMask * centerBand * (.22 + turbulence * 1.55);
      diskIntensity *= smoothstep(horizonRadius + .04, horizonRadius + .14, r);

      float doppler = clamp(.5 + diskP.x * .55, 0.0, 1.0);
      vec3 hot = mix(vec3(1.4, .22, .035), vec3(.62, .85, 1.5), doppler);
      vec3 whiteHot = vec3(1.48, 1.16, .82);
      vec3 diskColor = mix(hot, whiteHot, pow(max(turbulence - .54, 0.0), .45));
      color += diskColor * diskIntensity * 1.7;

      float lensArcTop = exp(-abs(length(vec2(p.x, (p.y - horizonRadius * .58) / .55)) - photonRadius) * 76.0);
      float lensArcBottom = exp(-abs(length(vec2(p.x, (p.y + horizonRadius * .62) / .6)) - photonRadius) * 80.0);
      float arcGate = smoothstep(-.08, .18, abs(p.y));
      color += vec3(1.05, .67, .38) * lensArcTop * arcGate * .62;
      color += vec3(.42, .62, 1.15) * lensArcBottom * arcGate * .42;

      float shadow = 1.0 - smoothstep(horizonRadius - .018, horizonRadius + .012, r);
      color *= 1.0 - shadow;

      float glow = exp(-max(r - horizonRadius, 0.0) * 8.0) * (1.0 - shadow);
      color += vec3(.16, .08, .04) * glow;

      float vignette = 1.0 - smoothstep(.78, 1.9, length(p * vec2(.72, .9)));
      color *= .42 + .58 * vignette;
      color = 1.0 - exp(-color * 1.25);
      color = pow(color, vec3(.86));

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram() {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  let program;
  try {
    program = createProgram();
  } catch (error) {
    console.error(error);
    fallback.hidden = false;
    return;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    time: gl.getUniformLocation(program, "uTime"),
    yaw: gl.getUniformLocation(program, "uYaw"),
    pitch: gl.getUniformLocation(program, "uPitch"),
    zoom: gl.getUniformLocation(program, "uZoom"),
    gravity: gl.getUniformLocation(program, "uGravity"),
    speed: gl.getUniformLocation(program, "uSpeed")
  };

  const state = {
    yaw: 0,
    pitch: 0,
    zoom: 1,
    targetYaw: 0,
    targetPitch: 0,
    targetZoom: 1,
    gravity: Number(gravityInput.value),
    speed: Number(speedInput.value),
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    autoOrbit: true,
    lastPinchDistance: 0
  };
  const activePointers = new Map();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.floor(innerWidth * dpr);
    const height = Math.floor(innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function pointerDown(event) {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (activePointers.size === 1) {
      state.dragging = true;
      state.pointerId = event.pointerId;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    } else if (activePointers.size === 2) {
      state.dragging = false;
      const points = [...activePointers.values()];
      state.lastPinchDistance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    }
  }

  function pointerMove(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 2) {
      const points = [...activePointers.values()];
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      if (state.lastPinchDistance > 0) {
        state.targetZoom = Math.max(.58, Math.min(2.15, state.targetZoom * distance / state.lastPinchDistance));
      }
      state.lastPinchDistance = distance;
      return;
    }

    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.targetYaw += dx * .008;
    state.targetPitch = Math.max(-1.2, Math.min(1.2, state.targetPitch + dy * .006));
  }

  function pointerUp(event) {
    activePointers.delete(event.pointerId);
    state.lastPinchDistance = 0;
    if (activePointers.size === 1) {
      const [pointerId, point] = activePointers.entries().next().value;
      state.dragging = true;
      state.pointerId = pointerId;
      state.lastX = point.x;
      state.lastY = point.y;
    } else {
      state.dragging = false;
      state.pointerId = null;
    }
  }

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.targetZoom = Math.max(.58, Math.min(2.15, state.targetZoom * Math.exp(-event.deltaY * .001)));
  }, { passive: false });

  gravityInput.addEventListener("input", () => {
    state.gravity = Number(gravityInput.value);
  });

  speedInput.addEventListener("input", () => {
    state.speed = Number(speedInput.value);
  });

  orbitButton.addEventListener("click", () => {
    state.autoOrbit = !state.autoOrbit;
    orbitButton.classList.toggle("active", state.autoOrbit);
    orbitButton.setAttribute("aria-pressed", String(state.autoOrbit));
  });

  resetButton.addEventListener("click", () => {
    state.targetYaw = 0;
    state.targetPitch = 0;
    state.targetZoom = 1;
    state.gravity = 1.08;
    state.speed = .82;
    state.autoOrbit = true;
    gravityInput.value = String(state.gravity);
    speedInput.value = String(state.speed);
    orbitButton.classList.add("active");
    orbitButton.setAttribute("aria-pressed", "true");
  });

  let previousTime = performance.now();
  let frameCounter = 0;
  let fpsTime = previousTime;

  function render(now) {
    resize();
    const delta = Math.min((now - previousTime) / 1000, .05);
    previousTime = now;

    if (state.autoOrbit && !state.dragging) {
      state.targetYaw += delta * .055;
    }

    state.yaw += (state.targetYaw - state.yaw) * .055;
    state.pitch += (state.targetPitch - state.pitch) * .055;
    state.zoom += (state.targetZoom - state.zoom) * .07;

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, now / 1000);
    gl.uniform1f(uniforms.yaw, state.yaw);
    gl.uniform1f(uniforms.pitch, state.pitch);
    gl.uniform1f(uniforms.zoom, state.zoom);
    gl.uniform1f(uniforms.gravity, state.gravity);
    gl.uniform1f(uniforms.speed, state.speed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    coordinates.textContent = `ORBIT ${state.yaw.toFixed(2)} / ${state.pitch.toFixed(2)}`;

    frameCounter += 1;
    if (now - fpsTime > 1000) {
      fpsLabel.textContent = `${frameCounter} FPS`;
      frameCounter = 0;
      fpsTime = now;
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
