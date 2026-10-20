/**
 * Hero scene — a field of light.
 *
 * A uniform weave of dots covers the whole hero and behaves like a sheet of
 * cloth. Three wave trains roll through it at different angles, speeds and
 * wavelengths, measured from a doubly warped copy of each point so the folds
 * braid and meander instead of running as straight stripes. The folds lift the
 * sheet toward the viewer, gather the grid on their rising faces and light a
 * soft band along each crest, with a bright seam where the cloth turns over.
 * The whole sheet leans toward the cursor and dips where it passes. There are
 * no lines anywhere.
 *
 * Every so often the weave lets go — the dots drift off their places, the grid
 * dissolves, and then it gathers itself back into line. Clicking the hero
 * drops the cycle at whichever state you want, so you can switch it by hand
 * and it carries on breathing from there. Links and buttons are left alone.
 *
 * The copy stays the loudest thing on screen: the field is dimmed where the
 * text lives, and dimmed again on narrow screens, where the copy is centred.
 *
 * Graceful exits: without WebGL the CSS backdrop stays exactly as it was, and
 * reduced-motion visitors get one settled frame instead of a loop.
 */
(function () {
  'use strict'

  const canvas = document.getElementById('hero-scene')
  if (!canvas) return

  const hero = canvas.closest('#hero') || canvas.parentElement
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isCompact = window.matchMedia('(max-width: 768px)').matches

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  })

  if (!gl) {
    canvas.remove()
    return
  }

  /*--------------------------------------------------------------
  # Tunables
  --------------------------------------------------------------*/
  const CAMERA_Z = 3.7
  const FIELD_OF_VIEW = Math.PI / 4.2
  const MAX_DPR = 1.75

  const SPACING = isCompact ? 0.047 : 0.046  // field units between dots
  const JITTER = 0.03                        // fraction of the spacing

  const RIPPLE_SPEED = 0.62
  const RIPPLE_GAP = 10.5

  /*--------------------------------------------------------------
  # Geometry
  --------------------------------------------------------------*/
  let seed = 20240517
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  let nodeCount = 0
  let nodes = new Float32Array(0)
  let scatter = new Float32Array(0)
  let drift = new Float32Array(0)
  let meta = new Float32Array(0)

  /* Positions live in "field units": y runs -1…1 from the middle of the hero
     to its top edge, x stretches with the aspect ratio. One unit is the same
     number of pixels either way, so the grid never looks stretched. */
  const buildField = (aspect) => {
    const halfWidth = aspect * 1.06
    const halfHeight = 1.06
    /* Extra rows and columns so a dot can drift outward without leaving a
       bare edge behind it. */
    const columns = Math.ceil((halfWidth * 2) / SPACING) + 4
    const rows = Math.ceil((halfHeight * 2) / SPACING) + 4

    nodeCount = columns * rows
    nodes = new Float32Array(nodeCount * 3)
    scatter = new Float32Array(nodeCount * 3)
    drift = new Float32Array(nodeCount * 3)
    meta = new Float32Array(nodeCount * 3)

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column

        /* A regular grid, nudged just enough to look hand-placed. Every dot
           is the same size and brightness: the motion carries the variety. */
        const x = -halfWidth + column * SPACING + (random() - 0.5) * SPACING * JITTER
        const y = -halfHeight + row * SPACING + (random() - 0.5) * SPACING * JITTER

        nodes[index * 3] = x
        nodes[index * 3 + 1] = y
        nodes[index * 3 + 2] = 0

        /* Assembly sweeps across the field instead of popping in at once. */
        scatter[index * 3] = x + (random() - 0.5) * 0.1
        scatter[index * 3 + 1] = y + (random() - 0.5) * 0.1
        scatter[index * 3 + 2] = 0

        /* Where this dot wanders to when the weave comes apart. It keeps its
           own direction, so the mess reads as the same dots drifting rather
           than a new field appearing. */
        const angle = random() * Math.PI * 2
        const reach = SPACING * (0.55 + random() * 1.15)
        drift[index * 3] = Math.cos(angle) * reach
        drift[index * 3 + 1] = Math.sin(angle) * reach
        drift[index * 3 + 2] = (random() - 0.5) * 0.42

        meta[index * 3] = 0.0095                            // size
        meta[index * 3 + 1] = 1                             // brightness
        meta[index * 3 + 2] = (column / columns) * 0.5 + (1 - row / rows) * 0.5
      }
    }
  }

  /*--------------------------------------------------------------
  # Shaders
  --------------------------------------------------------------*/
  const NODE_VERTEX = `
    attribute vec3 aPos;
    attribute vec3 aScatter;
    attribute vec3 aDrift;
    attribute vec3 aMeta;

    uniform mat4 uProj;
    uniform float uCamZ;
    uniform float uHalfHeight;
    uniform vec2 uPointer;
    uniform vec2 uParallax;
    uniform vec2 uTilt;
    uniform float uProgress;
    uniform float uChaos;
    uniform float uRippleRadius;
    uniform vec2 uRippleOrigin;
    uniform float uTime;
    uniform float uVeil;
    uniform float uDim;
    uniform float uFocal;
    uniform float uDpr;
    uniform float uSizeMul;
    uniform float uAlphaMul;
    uniform float uSoftness;

    varying float vAlpha;
    varying vec3 vColor;

    /* A soft ring that peaks where the wave front is. */
    float ring(float distance, float radius) {
      return smoothstep(0.30, 0.0, abs(distance - radius));
    }

    void main() {
      /* Staggered materialise, sweeping across the field. */
      float grow = clamp((uProgress - aMeta.z * 0.4) / 0.6, 0.0, 1.0);
      grow = grow * grow * (3.0 - 2.0 * grow);

      vec3 p = mix(aScatter, aPos, grow);

      /* Now and then the weave lets go: every dot drifts off its own place, the
         grid dissolves, and then it gathers itself back into line. */
      p += aDrift * uChaos;

      /* Folds. Three wave trains cross the weave at different angles, speeds
         and wavelengths — one broad swell carrying the sheet, one counter-wave
         that breaks up its rhythm, and a short ripple riding on top. */
      /* The fold directions drift very slowly, so the pattern never settles
         into a fixed angle the eye can memorise. */
      float angA = 0.77 + 0.16 * sin(uTime * 0.043);
      float angB = 2.03 + 0.19 * sin(uTime * 0.037 + 1.4);
      vec2 dirA = vec2(cos(angA), sin(angA));
      vec2 dirB = vec2(cos(angB), sin(angB));
      vec2 dirC = normalize(vec2(0.94, -0.34));

      /* Domain warp: the folds are measured from a slowly displaced copy of
         the point, so they bend, bunch up and merge instead of running as
         straight printed stripes. */
      float warpX = sin(dot(p.xy, vec2(1.13, 0.87)) * 1.7 + uTime * 0.29);
      float warpY = sin(dot(p.xy, vec2(-0.74, 1.21)) * 2.1 - uTime * 0.24 + 1.1);

      /* A second, finer octave braids the folds instead of leaving them as
         clean arcs. */
      warpX += sin(dot(p.xy, vec2(-2.3, 1.9)) * 3.3 - uTime * 0.53 + 2.6) * 0.34;
      warpY += sin(dot(p.xy, vec2(2.7, 2.1)) * 3.9 + uTime * 0.61 + 0.4) * 0.34;

      vec2 w = p.xy + vec2(warpX, warpY) * 0.21;

      float phaseA = dot(w, dirA) * 6.2 - uTime * 1.05;
      float phaseB = dot(w, dirB) * 3.6 - uTime * 0.62 + 2.3;
      float phaseC = dot(w, dirC) * 10.8 - uTime * 1.5 + 4.1;

      float height = sin(phaseA) * 0.54 + sin(phaseB) * 0.29 + sin(phaseC) * 0.17;

      /* Lift the sheet toward the viewer on the crests... */
      p.z += height * 0.26;

      /* ...and let the weave slide along the two long waves, so the grid
         gathers on the rising faces and stretches over the peaks. The short
         ripple is left out here — displacing by it would only roughen the
         lattice without adding shape. */
      p.xy += dirA * cos(phaseA) * 0.046;
      p.xy += dirB * cos(phaseB) * 0.021;

      /* Light falls on the crests: the whole rising face glows, and a thin
         seam runs along the top of the fold where the cloth turns over. The
         short ripple adds a faint shimmer on top. Because the crests come from
         the height field itself, every wave, warp and envelope shows up in
         them at once. */
      float lit = smoothstep(0.42, 0.94, sin(phaseA));

      /* The band swells and thins along its own length, so it looks like a fold
         rolling through rather than a stripe of constant width. */
      lit *= 0.72 + 0.28 * sin(dot(w, dirA) * 1.35 + uTime * 0.47);

      float cross = smoothstep(0.68, 1.0, sin(phaseB)) * (0.5 + 0.16 * sin(uTime * 0.23));
      float shimmer = pow(0.5 + 0.5 * sin(phaseC), 7.0) * (0.2 + 0.14 * sin(uTime * 0.31 + 2.0));
      float crest = min(lit + cross + shimmer, 1.0);

      /* A click sends a ring across the cloth: it lifts the weave and lights
         it, without pushing the dots out of line. */
      vec2 spread = p.xy - uRippleOrigin;
      float distance = length(spread);
      float ripple = ring(distance, uRippleRadius) + ring(distance, uRippleRadius - 0.44) * 0.45;
      ripple *= 1.0 - smoothstep(2.2, 3.4, uRippleRadius);
      ripple = min(ripple, 1.4);

      p.z += ripple * 0.07;
      p.xy += normalize(spread + vec2(0.0001)) * ripple * 0.005;

      /* Pointer: the cloth dips under the cursor, and warms where it bends.
         No lateral push — pulling the weave sideways leaves a visible rim. */
      vec2 away = p.xy - uPointer;
      float reach = 1.0 - smoothstep(0.0, 0.55, length(away));
      float dent = reach * reach * reach;
      p.z -= dent * 0.16;

      /* Depth parallax — the whole weave slides against the backdrop. */
      p.xy -= uParallax * (0.5 + p.z * 2.4);

      /* The whole sheet leans toward the cursor. Rotating the plane instead of
         sliding it means the weave foreshortens and the near rows grow, so the
         field reads as a surface in space rather than a flat pattern. */
      vec3 world = vec3(p.xy * uHalfHeight, p.z);
      float cx = cos(uTilt.x), sx = sin(uTilt.x);
      float cy = cos(uTilt.y), sy = sin(uTilt.y);
      world = vec3(cy * world.x + sy * world.z, world.y, -sy * world.x + cy * world.z);
      world = vec3(world.x, cx * world.y - sx * world.z, sx * world.y + cx * world.z);

      float depth = uCamZ - world.z;
      gl_Position = uProj * vec4(world.xy, world.z - uCamZ, 1.0);

      /* Keep the copy legible: dim the left side of the field. */
      float veil = mix(1.0 - uVeil, 1.0, smoothstep(-0.78, 0.05, gl_Position.x / gl_Position.w));

      /* Relief: the far side of every fold sits deeper and dimmer, the near
         side comes forward, so the sheet has real thickness. */
      float relief = 0.5 + 0.5 * height;
      vAlpha = (grow * (0.24 + crest * 0.95 + reach * 0.28 + ripple * 0.55) * mix(0.86, 1.06, relief)) * uAlphaMul * veil * uDim;
      vColor = mix(vec3(0.34, 0.72, 1.0), vec3(0.96, 1.0, 1.0), min(crest * 0.8 + ripple + reach * 0.4, 1.0));

      gl_PointSize = clamp(aMeta.x * uSizeMul * (1.0 + ripple * 0.3) * uDpr * uFocal / depth, 1.0, 40.0 * uDpr);
    }
  `

  const NODE_FRAGMENT = `
    precision mediump float;

    uniform float uSoftness;

    varying float vAlpha;
    varying vec3 vColor;

    void main() {
      float radius = length(gl_PointCoord - 0.5) * 2.0;
      if (radius > 1.0) discard;

      /* uSoftness 0 gives a crisp disc with a thin antialiased rim;
         uSoftness 1 gives a soft radial glow for the halo pass. */
      float edge = mix(0.86, 0.0, uSoftness);
      float alpha = (1.0 - smoothstep(edge, 1.0, radius)) * vAlpha;

      /* Premultiplied so the blend modes stay honest. */
      gl_FragColor = vec4(vColor * alpha, alpha);
    }
  `

  /*--------------------------------------------------------------
  # WebGL plumbing
  --------------------------------------------------------------*/
  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Hero scene shader:', gl.getShaderInfoLog(shader))
      return null
    }
    return shader
  }

  const createProgram = (vertexSource, fragmentSource) => {
    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource)
    if (!vertexShader || !fragmentShader) return null

    const program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Hero scene link:', gl.getProgramInfoLog(program))
      return null
    }
    return program
  }

  const program = createProgram(NODE_VERTEX, NODE_FRAGMENT)

  if (!program) {
    canvas.remove()
    return
  }

  const buffers = {
    pos: gl.createBuffer(),
    scatter: gl.createBuffer(),
    drift: gl.createBuffer(),
    meta: gl.createBuffer()
  }

  const uniforms = {}
  const attributes = {}

  ;[
    'uProj', 'uCamZ', 'uHalfHeight', 'uPointer', 'uParallax', 'uTilt',
    'uProgress', 'uChaos', 'uRippleRadius', 'uRippleOrigin', 'uTime', 'uVeil', 'uDim',
    'uFocal', 'uDpr', 'uSizeMul', 'uAlphaMul', 'uSoftness'
  ].forEach((name) => { uniforms[name] = gl.getUniformLocation(program, name) })

  ;['aPos', 'aScatter', 'aDrift', 'aMeta'].forEach((name) => {
    attributes[name] = gl.getAttribLocation(program, name)
  })

  const upload = (handle, data) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, handle)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
  }

  const rebuild = () => {
    buildField(width / height)
    upload(buffers.pos, nodes)
    upload(buffers.scatter, scatter)
    upload(buffers.drift, drift)
    upload(buffers.meta, meta)
  }

  /*--------------------------------------------------------------
  # Camera
  --------------------------------------------------------------*/
  const projection = (fieldOfView, aspect) => {
    const f = 1 / Math.tan(fieldOfView / 2)
    const near = 0.1
    const far = 40
    const range = 1 / (near - far)
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * range, -1,
      0, 0, 2 * far * near * range, 0
    ])
  }

  /*--------------------------------------------------------------
  # State
  --------------------------------------------------------------*/
  let width = 0
  let height = 0
  let dpr = 1
  let halfHeight = 1
  let focal = 1
  let aspect = 1
  let matrix = projection(FIELD_OF_VIEW, 1)
  let settled = false

  const pointer = { x: 0, y: 0 }
  const pointerTarget = { x: 0, y: 0 }
  const parallax = { x: 0, y: 0 }
  const tilt = { x: 0, y: 0 }
  let lastPointerAt = 0

  const startedAt = performance.now()
  let rafId = 0
  let inView = true

  /* Ripples: now and then one sweeps through from a random spot. They are a
     whisper of movement, not an event. */
  const ripple = { originX: 0, originY: 0, start: 1.2 }
  const triggerRipple = (x, y) => {
    ripple.originX = x
    ripple.originY = y
    ripple.start = (performance.now() - startedAt) / 1000
  }

  /* The weave breathes on its own: long stretches of clean lattice, then it
     lets go into a loose drift and gathers itself back. The cycle is offset so
     the opening assembly finishes before the first loosening starts. */
  const CHAOS_CYCLE = 23
  const CHAOS_FIRST = 8

  /* Where in the cycle a click drops the weave: just past the start of the
     drift, or well inside the calm stretch so it stays put for a while. */
  const PHASE_MESSY = 3.6
  const PHASE_CALM = 12.5

  const smoothstep = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
  }

  /* The cycle can be nudged forward by a click, which is what lets a click
     switch state without stopping the breathing. */
  let cycleOffset = 0
  const chaosAt = (time) => {
    const phase = (((time - CHAOS_FIRST - cycleOffset) % CHAOS_CYCLE) + CHAOS_CYCLE) % CHAOS_CYCLE
    return smoothstep(0, 3.2, phase) * (1 - smoothstep(6.4, 10.6, phase))
  }

  /* The value actually drawn eases toward the cycle, so a click lands as a
     glide rather than a jump and the automatic drift stays calm. */
  let chaos = 0
  let lastFrameAt = 0

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const previousAspect = aspect
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    width = rect.width
    height = rect.height
    aspect = width / height
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    matrix = projection(FIELD_OF_VIEW, aspect)
    halfHeight = CAMERA_Z * Math.tan(FIELD_OF_VIEW / 2)
    focal = (height * 0.5) / Math.tan(FIELD_OF_VIEW / 2)

    gl.viewport(0, 0, canvas.width, canvas.height)

    /* Rebuild only when the shape of the viewport really changed. */
    if (!nodeCount || Math.abs(aspect - previousAspect) > 0.02) rebuild()
  }

  const drawFrame = (time) => {
    const progress = settled ? 1 : Math.min(1, Math.max(0, (time - 0.15) / 1.9))
    if (progress >= 1) settled = true

    /* Automatic ripples, spaced out. */
    if (time - ripple.start > RIPPLE_GAP) {
      triggerRipple(
        (Math.random() * 2 - 1) * aspect * 0.85,
        (Math.random() * 2 - 1) * 0.8
      )
    }

    const rippleAge = time - ripple.start
    const rippleRadius = rippleAge >= 0 ? rippleAge * RIPPLE_SPEED : -10

    const idle = performance.now() - lastPointerAt > 3200
    if (idle) {
      pointerTarget.x = Math.sin(time * 0.27) * 0.55
      pointerTarget.y = Math.cos(time * 0.19) * 0.4
    }

    pointer.x += (pointerTarget.x - pointer.x) * 0.05
    pointer.y += (pointerTarget.y - pointer.y) * 0.05

    parallax.x += (pointer.x * 0.05 - parallax.x) * 0.06
    parallax.y += (pointer.y * 0.038 - parallax.y) * 0.06

    /* Lean: the sheet follows the cursor with a little lag. */
    tilt.x += (-pointer.y * 0.05 - tilt.x) * 0.045
    tilt.y += (pointer.x * 0.035 - tilt.y) * 0.045

    /* Screen coords to field units: x stretches with the aspect ratio. */
    const pointerFieldX = pointer.x * aspect
    const pointerFieldY = pointer.y

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)

    gl.useProgram(program)
    gl.uniformMatrix4fv(uniforms.uProj, false, matrix)
    gl.uniform1f(uniforms.uCamZ, CAMERA_Z)
    gl.uniform1f(uniforms.uHalfHeight, halfHeight)
    gl.uniform2f(uniforms.uPointer, pointerFieldX, pointerFieldY)
    gl.uniform2f(uniforms.uParallax, parallax.x, parallax.y)
    gl.uniform2f(uniforms.uTilt, tilt.x, tilt.y)
    gl.uniform1f(uniforms.uProgress, progress)
    /* Ease toward the cycle. Frame-rate independent, so a slow machine does
       not stretch the dissolve. */
    const target = chaosAt(time)
    const dt = lastFrameAt ? Math.min(0.1, time - lastFrameAt) : 1 / 60
    lastFrameAt = time
    chaos += (target - chaos) * (1 - Math.exp(-dt / 0.42))
    gl.uniform1f(uniforms.uChaos, chaos)
    gl.uniform1f(uniforms.uRippleRadius, rippleRadius)
    gl.uniform2f(uniforms.uRippleOrigin, ripple.originX, ripple.originY)
    gl.uniform1f(uniforms.uTime, time)
    gl.uniform1f(uniforms.uVeil, aspect > 1.15 ? 0.52 : 0.45)
    /* Narrow screens centre the copy over the field, so dim it everywhere. */
    gl.uniform1f(uniforms.uDim, aspect > 1.15 ? 1.0 : 0.62)
    gl.uniform1f(uniforms.uFocal, focal)
    gl.uniform1f(uniforms.uDpr, dpr)

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos)
    gl.enableVertexAttribArray(attributes.aPos)
    gl.vertexAttribPointer(attributes.aPos, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.scatter)
    gl.enableVertexAttribArray(attributes.aScatter)
    gl.vertexAttribPointer(attributes.aScatter, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.drift)
    gl.enableVertexAttribArray(attributes.aDrift)
    gl.vertexAttribPointer(attributes.aDrift, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.meta)
    gl.enableVertexAttribArray(attributes.aMeta)
    gl.vertexAttribPointer(attributes.aMeta, 3, gl.FLOAT, false, 0, 0)

    /* Two passes: an additive halo for the glow, then a solid core on top so
       the dots stay crisp whatever the photo is doing behind them. */
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.uniform1f(uniforms.uSizeMul, 2.0)
    gl.uniform1f(uniforms.uAlphaMul, 0.1)
    gl.uniform1f(uniforms.uSoftness, 1.0)
    gl.drawArrays(gl.POINTS, 0, nodeCount)

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.uniform1f(uniforms.uSizeMul, 1.0)
    gl.uniform1f(uniforms.uAlphaMul, 1.0)
    gl.uniform1f(uniforms.uSoftness, 0.0)
    gl.drawArrays(gl.POINTS, 0, nodeCount)

    if (canvas.classList.contains('is-ready')) return
    canvas.classList.add('is-ready')
  }

  const loop = (now) => {
    rafId = requestAnimationFrame(loop)
    /* Off-screen the scene keeps its last frame; skipping the draw is enough
       to save the GPU, and stopping the loop would blank a WebGL canvas. */
    if (!inView) return
    drawFrame((now - startedAt) / 1000)
  }

  /*--------------------------------------------------------------
  # Wiring
  --------------------------------------------------------------*/
  resize()

  if (prefersReducedMotion) {
    drawFrame(4.5)
  } else {
    rafId = requestAnimationFrame(loop)
  }

  window.addEventListener('pointermove', (event) => {
    const rect = hero.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) return

    pointerTarget.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerTarget.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    lastPointerAt = performance.now()
  }, { passive: true })

  /* Clicking the hero switches the weave between the clean lattice and the
     loose drift. It works by dropping the breathing cycle at the matching
     point, so the switch is immediate and the weave carries on by itself
     afterwards. Links and buttons keep working normally. */
  hero.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return

    const now = (performance.now() - startedAt) / 1000
    const goingMessy = chaos <= 0.5
    cycleOffset = now - CHAOS_FIRST - (goingMessy ? PHASE_MESSY : PHASE_CALM)

    if (prefersReducedMotion) {
      chaos = chaosAt(now)
      drawFrame(4.5)
    }
  })

  let resizeTimer = 0
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      resize()
      if (prefersReducedMotion) drawFrame(4.5)
    }, 150)
  })

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => { inView = entry.isIntersecting })
    }, { rootMargin: '120px' }).observe(hero)
  }
})()
