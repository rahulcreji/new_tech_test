(() => {
  const ICE_SERVERS = [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // DOM Elements
  const lobbyView = document.getElementById("lobby-view");
  const cameraView = document.getElementById("camera-view");
  const remoteView = document.getElementById("remote-view");

  const roomInput = document.getElementById("room-input");
  const randomRoomBtn = document.getElementById("random-room-btn");
  const shareLinkBtn = document.getElementById("share-link-btn");
  const startCameraBtn = document.getElementById("start-camera-btn");
  const startRemoteBtn = document.getElementById("start-remote-btn");

  const cameraVideo = document.getElementById("camera-video");
  const cameraFlash = document.getElementById("camera-flash");
  const cameraDot = document.getElementById("camera-dot");
  const cameraStatus = document.getElementById("camera-status");
  const cameraRoomBadge = document.getElementById("camera-room-badge");
  const cameraExitBtn = document.getElementById("camera-exit-btn");
  const cameraLocalSnapBtn = document.getElementById("camera-local-snap-btn");
  const flipCameraBtn = document.getElementById("flip-camera-btn");

  const remoteVideo = document.getElementById("remote-video");
  const remoteWaitingOverlay = document.getElementById("remote-waiting-overlay");
  const remoteWaitingText = document.getElementById("remote-waiting-text");
  const remoteCountdown = document.getElementById("remote-countdown");
  const remoteFlash = document.getElementById("remote-flash");
  const remoteDot = document.getElementById("remote-dot");
  const remoteStatus = document.getElementById("remote-status");
  const remoteRoomBadge = document.getElementById("remote-room-badge");
  const remoteExitBtn = document.getElementById("remote-exit-btn");
  const remoteRotateBtn = document.getElementById("remote-rotate-btn");
  const remoteSnapBtn = document.getElementById("remote-snap-btn");
  const timerBtn = document.getElementById("timer-btn");
  const remoteGalleryBtn = document.getElementById("remote-gallery-btn");
  const remoteThumb = document.getElementById("remote-thumb");
  const zoomSlider = document.getElementById("zoom-slider");
  const zoomInBtn = document.getElementById("zoom-in-btn");
  const zoomOutBtn = document.getElementById("zoom-out-btn");
  const zoomLabel = document.getElementById("zoom-label");

  const remoteCountBadge = document.getElementById("remote-count-badge");
  const remoteSubmitBtn = document.getElementById("remote-submit-btn");
  const remoteSubmitCount = document.getElementById("remote-submit-count");

  const photoModal = document.getElementById("photo-modal");
  const modalCounter = document.getElementById("modal-counter");
  const modalAddBtn = document.getElementById("modal-add-btn");
  const modalCropBtn = document.getElementById("modal-crop-btn");
  const modalRotateBtn = document.getElementById("modal-rotate-btn");
  const modalDownloadAllBtn = document.getElementById("modal-download-all-btn");
  const modalSubmitBtn = document.getElementById("modal-submit-btn");
  const modalImage = document.getElementById("modal-image");
  const cropOverlay = document.getElementById("crop-overlay");
  const cropBox = document.getElementById("crop-box");
  const cropBar = document.getElementById("crop-bar");
  const cropApplyBtn = document.getElementById("crop-apply-btn");
  const cropCancelBtn = document.getElementById("crop-cancel-btn");
  const modalStrip = document.getElementById("modal-strip");
  const modalDownloadBtn = document.getElementById("modal-download-btn");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  const answerModal = document.getElementById("answer-modal");
  const answerModel = document.getElementById("answer-model");
  const answerLoading = document.getElementById("answer-loading");
  const answerBody = document.getElementById("answer-body");
  const answerBackBtn = document.getElementById("answer-back-btn");
  const answerNextBtn = document.getElementById("answer-next-btn");
  const toastEl = document.getElementById("toast");

  // State
  let currentRole = null; // "camera" | "remote"
  let currentRoom = "";
  let ws = null;
  let pc = null;
  let dataChannel = null;
  let localStream = null;
  let facingMode = "environment";
  let wakeLock = null;
  let pendingIceCandidates = [];
  let reconnectTimer = null;
  let pingInterval = null;
  let timerSeconds = 0;
  let isCountingDown = false;
  let capturedPhotos = []; // [{ url, filename }]
  let selectedPhotoIndex = 0;
  let incomingPhotoChunks = null;
  let remoteRotation = 0; // 0, 90, 180, 270
  let captureRotationAngle = 0;
  let cameraZoomState = { hardware: false, min: 1, max: 5, step: 0.1, value: 1 };

  // Helpers
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 2500);
  }

  function generateRoomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function sanitizeRoom(val) {
    return (val || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }

  function switchView(name) {
    lobbyView.classList.remove("active");
    cameraView.classList.remove("active");
    remoteView.classList.remove("active");
    if (name === "lobby") lobbyView.classList.add("active");
    if (name === "camera") cameraView.classList.add("active");
    if (name === "remote") remoteView.classList.add("active");
  }

  function setCameraStatus(text, state = "waiting") {
    cameraStatus.textContent = text;
    cameraDot.className = `dot ${state}`;
  }

  function setRemoteStatus(text, state = "waiting") {
    remoteStatus.textContent = text;
    remoteDot.className = `dot ${state}`;
  }

  function triggerFlash(el) {
    el.classList.remove("active");
    void el.offsetWidth;
    el.classList.add("active");
  }

  function playShutterSound() {
    // Intentionally silent on both devices
  }

  function renderModalPhoto() {
    if (capturedPhotos.length === 0) return;
    selectedPhotoIndex = Math.max(0, Math.min(selectedPhotoIndex, capturedPhotos.length - 1));
    const item = capturedPhotos[selectedPhotoIndex];

    modalCounter.textContent = `${selectedPhotoIndex + 1} / ${capturedPhotos.length}`;
    modalImage.src = item.url;

    const showDownloads = currentRole === "remote";
    modalDownloadBtn.style.display = showDownloads ? "inline-flex" : "none";
    modalDownloadAllBtn.style.display = showDownloads && capturedPhotos.length > 1 ? "inline-flex" : "none";
    modalDownloadBtn.href = item.url;
    modalDownloadBtn.download = item.filename;

    modalStrip.innerHTML = "";
    capturedPhotos.forEach((photo, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `modal-strip-item${idx === selectedPhotoIndex ? " active" : ""}`;
      btn.title = `Photo ${idx + 1}`;
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = `Photo ${idx + 1}`;
      btn.appendChild(img);
      btn.addEventListener("click", () => {
        selectedPhotoIndex = idx;
        renderModalPhoto();
      });
      modalStrip.appendChild(btn);
    });
  }

  function updateLastPhoto(blobUrl, filename = `live-shutter-${Date.now()}.jpg`) {
    capturedPhotos.push({ url: blobUrl, filename });
    selectedPhotoIndex = capturedPhotos.length - 1;

    remoteThumb.src = blobUrl;
    remoteGalleryBtn.classList.remove("empty");
    remoteCountBadge.textContent = String(capturedPhotos.length);
    remoteCountBadge.classList.remove("hidden");

    remoteSubmitCount.textContent = String(capturedPhotos.length);
    remoteSubmitBtn.classList.remove("hidden");

    if (!photoModal.classList.contains("hidden")) {
      renderModalPhoto();
    }
  }

  function clearCapturedPhotos() {
    for (const item of capturedPhotos) {
      URL.revokeObjectURL(item.url);
    }
    capturedPhotos = [];
    selectedPhotoIndex = 0;
    remoteThumb.src = "";
    remoteGalleryBtn.classList.add("empty");
    remoteCountBadge.textContent = "0";
    remoteCountBadge.classList.add("hidden");
    remoteSubmitCount.textContent = "0";
    remoteSubmitBtn.classList.add("hidden");
    photoModal.classList.add("hidden");
    answerModal.classList.add("hidden");
  }

  function triggerDownload(blobUrl, filename) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      // Ignore if wake lock is denied
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  // Signaling WebSocket
  function connectWebSocket() {
    if (ws) {
      ws.onclose = null;
      ws.close();
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}/ws?room=${encodeURIComponent(currentRoom)}&role=${currentRole}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    ws.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "pong") return;

      if (currentRole === "camera") {
        await handleCameraSignal(msg);
      } else if (currentRole === "remote") {
        await handleRemoteSignal(msg);
      }
    };

    ws.onclose = () => {
      clearInterval(pingInterval);
      if (!currentRole) return;
      if (currentRole === "camera") setCameraStatus("Reconnecting…", "waiting");
      if (currentRole === "remote") setRemoteStatus("Reconnecting…", "waiting");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebSocket, 2000);
    };
  }

  function sendSignal(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // WebRTC Cleanup
  function closePeerConnection() {
    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pc = null;
    }
    pendingIceCandidates = [];
  }

  async function flushIceCandidates() {
    if (!pc || !pc.remoteDescription) return;
    while (pendingIceCandidates.length > 0) {
      const candidate = pendingIceCandidates.shift();
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // Ignore stale ICE candidates
      }
    }
  }

  // ================= CAMERA ROLE =================
  async function startCameraStream() {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        aspectRatio: { ideal: 4 / 3 },
        width: { ideal: 1600 },
        height: { ideal: 1200 },
      },
      audio: false,
    });
    cameraVideo.srcObject = localStream;
    applyCameraPreviewTransform();

    // Detect hardware zoom capabilities (supported on Pixel 8 Android Chrome)
    const videoTrack = localStream.getVideoTracks()[0];
    const caps = videoTrack?.getCapabilities ? videoTrack.getCapabilities() : {};
    if (caps.zoom) {
      cameraZoomState = {
        hardware: true,
        min: caps.zoom.min ?? 1,
        max: caps.zoom.max ?? 8,
        step: caps.zoom.step ?? 0.1,
        value: caps.zoom.min ?? 1,
      };
      await applyCameraZoom(cameraZoomState.min);
    } else {
      cameraZoomState = { hardware: false, min: 1, max: 4, step: 0.1, value: 1 };
    }
    sendZoomCaps();

    // Replace track if WebRTC peer connection is already active
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
      }
    }
  }

  function applyCameraPreviewTransform() {
    const mirror = facingMode === "user" ? "scaleX(-1) " : "";
    const digitalScale = !cameraZoomState.hardware ? `scale(${cameraZoomState.value})` : "";
    cameraVideo.style.transform = `${mirror}${digitalScale}`.trim() || "none";
  }

  function sendZoomCaps() {
    const payload = { type: "zoom-caps", ...cameraZoomState };
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify(payload));
    } else {
      sendSignal(payload);
    }
  }

  async function applyCameraZoom(value) {
    const clamped = Math.min(cameraZoomState.max, Math.max(cameraZoomState.min, Number(value) || 1));
    cameraZoomState.value = clamped;

    if (cameraZoomState.hardware && localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({ advanced: [{ zoom: clamped }] });
        } catch {
          // Ignore unsupported constraint error
        }
      }
    } else {
      applyCameraPreviewTransform();
    }
  }

  async function createCameraPeerConnection() {
    closePeerConnection();
    setCameraStatus("Connecting to remote…", "waiting");

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    dataChannel = pc.createDataChannel("shutter");
    setupCameraDataChannel(dataChannel);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({ type: "ice", candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === "connected") {
        setCameraStatus("Live with remote", "live");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setCameraStatus("Waiting for remote…", "waiting");
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: pc.localDescription });
  }

  function setupCameraDataChannel(dc) {
    dc.onopen = () => {
      setCameraStatus("Live with remote", "live");
      sendZoomCaps();
    };
    dc.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "snap") {
          captureAndSendPhoto();
        } else if (msg.type === "zoom") {
          applyCameraZoom(msg.value);
        } else if (msg.type === "rotate") {
          captureRotationAngle = Number(msg.angle) || 0;
        }
      } catch {
        // Ignore malformed messages
      }
    };
  }

  async function handleCameraSignal(msg) {
    if (msg.type === "room-state") {
      if (msg.peers.includes("remote")) {
        await createCameraPeerConnection();
      } else {
        setCameraStatus("Waiting for remote…", "waiting");
      }
    } else if (msg.type === "peer-joined" && msg.role === "remote") {
      await createCameraPeerConnection();
    } else if (msg.type === "peer-left" && msg.role === "remote") {
      closePeerConnection();
      setCameraStatus("Waiting for remote…", "waiting");
    } else if (msg.type === "answer" && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      await flushIceCandidates();
    } else if (msg.type === "zoom-caps") {
      applyRemoteZoomCaps(msg);
    } else if (msg.type === "ice") {
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else {
        pendingIceCandidates.push(new RTCIceCandidate(msg.candidate));
      }
    } else if (msg.type === "snap") {
      // Fallback over WebSocket if DataChannel isn't open
      captureAndSendPhoto();
    } else if (msg.type === "zoom") {
      applyCameraZoom(msg.value);
    } else if (msg.type === "rotate") {
      captureRotationAngle = Number(msg.angle) || 0;
    }
  }

  async function captureAndSendPhoto() {
    if (!localStream) return;

    const filename = `live-shutter-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
    let fullBlob = null;

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack && "ImageCapture" in window) {
      try {
        const imageCapture = new ImageCapture(videoTrack);
        fullBlob = await imageCapture.takePhoto();
      } catch {
        fullBlob = null;
      }
    }

    if (!fullBlob) {
      const vw = cameraVideo.videoWidth || 1280;
      const vh = cameraVideo.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d");
      if (facingMode === "user") {
        ctx.translate(vw, 0);
        ctx.scale(-1, 1);
      }
      if (!cameraZoomState.hardware && cameraZoomState.value > 1) {
        const sw = vw / cameraZoomState.value;
        const sh = vh / cameraZoomState.value;
        const sx = (vw - sw) / 2;
        const sy = (vh - sh) / 2;
        ctx.drawImage(cameraVideo, sx, sy, sw, sh, 0, 0, vw, vh);
      } else {
        ctx.drawImage(cameraVideo, 0, 0, vw, vh);
      }
      fullBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
    }

    if (!fullBlob) return;

    if (captureRotationAngle % 360 !== 0) {
      fullBlob = await rotateImageBlob(fullBlob, captureRotationAngle);
    }

    const fullUrl = URL.createObjectURL(fullBlob);
    updateLastPhoto(fullUrl, filename);
    showToast("Photo captured!");

    // Send a compressed preview copy over DataChannel so wife's phone can see & save it
    if (dataChannel && dataChannel.readyState === "open") {
      sendPhotoOverDataChannel(fullBlob, filename);
    }
  }

  async function rotateImageBlob(blob, angle) {
    try {
      const bitmap = await createImageBitmap(blob);
      const rad = (angle * Math.PI) / 180;
      const swap = angle % 180 !== 0;
      const canvas = document.createElement("canvas");
      canvas.width = swap ? bitmap.height : bitmap.width;
      canvas.height = swap ? bitmap.width : bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      bitmap.close();
      return await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.94));
    } catch {
      return blob;
    }
  }

  async function sendPhotoOverDataChannel(blob, filename) {
    try {
      const bitmap = await createImageBitmap(blob);
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      const previewBlob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.86));
      const buffer = await previewBlob.arrayBuffer();
      const chunkSize = 16384;

      dataChannel.send(JSON.stringify({ type: "photo-start", size: buffer.byteLength, filename }));
      for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
        dataChannel.send(buffer.slice(offset, offset + chunkSize));
      }
      dataChannel.send(JSON.stringify({ type: "photo-end" }));
    } catch {
      // Ignore preview transfer errors
    }
  }

  // ================= REMOTE ROLE =================
  function setupRemotePeerConnection() {
    closePeerConnection();
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      remoteWaitingOverlay.classList.add("hidden");
      remoteSnapBtn.disabled = false;
      setRemoteStatus("Live", "live");
    };

    pc.ondatachannel = (event) => {
      dataChannel = event.channel;
      dataChannel.binaryType = "arraybuffer";
      dataChannel.onmessage = handleRemoteDataMessage;
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({ type: "ice", candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === "connected") {
        setRemoteStatus("Live", "live");
        remoteSnapBtn.disabled = false;
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setRemoteStatus("Connection lost", "error");
        remoteSnapBtn.disabled = true;
      }
    };
  }

  let remoteZoomHardware = true;

  function applyRemoteVideoTransform() {
    const scale = !remoteZoomHardware ? Number(zoomSlider.value) || 1 : 1;
    if (remoteRotation % 180 !== 0) {
      remoteVideo.style.inset = "auto";
      remoteVideo.style.top = "50%";
      remoteVideo.style.left = "50%";
      remoteVideo.style.width = "100dvh";
      remoteVideo.style.height = "100vw";
      remoteVideo.style.transform = `translate(-50%, -50%) rotate(${remoteRotation}deg) scale(${scale})`;
    } else {
      remoteVideo.style.top = "";
      remoteVideo.style.left = "";
      remoteVideo.style.inset = "0";
      remoteVideo.style.width = "100%";
      remoteVideo.style.height = "100%";
      remoteVideo.style.transform = `rotate(${remoteRotation}deg) scale(${scale})`;
    }
  }

  function applyRemoteZoomCaps(caps) {
    remoteZoomHardware = Boolean(caps.hardware);
    zoomSlider.min = String(caps.min ?? 1);
    zoomSlider.max = String(caps.max ?? 5);
    zoomSlider.step = String(caps.step ?? 0.1);
    const val = Number(caps.value ?? caps.min ?? 1);
    zoomSlider.value = String(val);
    zoomLabel.textContent = `${val.toFixed(1)}×`;
    applyRemoteVideoTransform();
  }

  function sendRemoteZoom(val) {
    const min = Number(zoomSlider.min);
    const max = Number(zoomSlider.max);
    const clamped = Math.min(max, Math.max(min, Number(val)));
    zoomSlider.value = String(clamped);
    zoomLabel.textContent = `${clamped.toFixed(1)}×`;
    applyRemoteVideoTransform();
    const payload = { type: "zoom", value: clamped };
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify(payload));
    } else {
      sendSignal(payload);
    }
  }

  function handleRemoteDataMessage(event) {
    if (typeof event.data === "string") {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "zoom-caps") {
          applyRemoteZoomCaps(msg);
        } else if (msg.type === "photo-start") {
          incomingPhotoChunks = { chunks: [], filename: msg.filename || "live-shutter.jpg" };
        } else if (msg.type === "photo-end" && incomingPhotoChunks) {
          const blob = new Blob(incomingPhotoChunks.chunks, { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          updateLastPhoto(url, incomingPhotoChunks.filename);
          incomingPhotoChunks = null;
          showToast("Photo received!");
        }
      } catch {
        // Ignore malformed control messages
      }
      return;
    }

    if (incomingPhotoChunks && event.data instanceof ArrayBuffer) {
      incomingPhotoChunks.chunks.push(event.data);
    }
  }

  async function handleRemoteSignal(msg) {
    if (msg.type === "room-state") {
      if (msg.peers.includes("camera")) {
        setRemoteStatus("Connecting to camera…", "waiting");
        remoteWaitingText.textContent = "Connecting to Camera Phone…";
      } else {
        setRemoteStatus("Waiting for camera…", "waiting");
        remoteWaitingOverlay.classList.remove("hidden");
        remoteWaitingText.textContent = "Waiting for Camera Phone to join…";
        remoteSnapBtn.disabled = true;
      }
    } else if (msg.type === "peer-joined" && msg.role === "camera") {
      setRemoteStatus("Camera joined, connecting…", "waiting");
      remoteWaitingText.textContent = "Camera joined, starting live view…";
    } else if (msg.type === "peer-left" && msg.role === "camera") {
      closePeerConnection();
      remoteVideo.srcObject = null;
      remoteWaitingOverlay.classList.remove("hidden");
      remoteWaitingText.textContent = "Camera Phone disconnected. Waiting…";
      remoteSnapBtn.disabled = true;
      setRemoteStatus("Waiting for camera…", "waiting");
    } else if (msg.type === "offer") {
      setupRemotePeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      await flushIceCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: "answer", sdp: pc.localDescription });
    } else if (msg.type === "zoom-caps") {
      applyRemoteZoomCaps(msg);
    } else if (msg.type === "ice") {
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else {
        pendingIceCandidates.push(new RTCIceCandidate(msg.candidate));
      }
    }
  }

  async function triggerRemoteSnap() {
    if (isCountingDown) return;

    if (timerSeconds > 0) {
      isCountingDown = true;
      remoteSnapBtn.disabled = true;
      remoteCountdown.classList.remove("hidden");
      for (let i = timerSeconds; i > 0; i--) {
        remoteCountdown.textContent = String(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      remoteCountdown.classList.add("hidden");
      remoteSnapBtn.disabled = false;
      isCountingDown = false;
    }

    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify({ type: "snap", id: Date.now() }));
    } else {
      sendSignal({ type: "snap", id: Date.now() });
    }
  }

  // ================= LIFECYCLE & EVENTS =================
  async function enterRole(role) {
    const code = sanitizeRoom(roomInput.value);
    if (code.length < 2) {
      showToast("Enter at least 2 characters for Room Code");
      return;
    }
    currentRoom = code;
    roomInput.value = code;
    currentRole = role;

    if (role === "camera") {
      cameraRoomBadge.textContent = code;
      switchView("camera");
      setCameraStatus("Starting camera…", "waiting");
      try {
        await startCameraStream();
        await requestWakeLock();
        setCameraStatus("Waiting for remote…", "waiting");
        connectWebSocket();
      } catch (err) {
        showToast("Camera permission denied or unavailable");
        exitToLobby();
      }
    } else {
      remoteRoomBadge.textContent = code;
      remoteWaitingOverlay.classList.remove("hidden");
      remoteSnapBtn.disabled = true;
      switchView("remote");
      setRemoteStatus("Connecting…", "waiting");
      connectWebSocket();
    }
  }

  function exitToLobby() {
    currentRole = null;
    clearTimeout(reconnectTimer);
    clearInterval(pingInterval);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    closePeerConnection();
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    cameraVideo.srcObject = null;
    remoteVideo.srcObject = null;
    releaseWakeLock();
    switchView("lobby");
  }

  randomRoomBtn.addEventListener("click", () => {
    roomInput.value = generateRoomCode();
  });

  shareLinkBtn.addEventListener("click", async () => {
    const code = sanitizeRoom(roomInput.value) || generateRoomCode();
    roomInput.value = code;
    const shareUrl = `${location.origin}/?room=${encodeURIComponent(code)}&role=remote`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Live Shutter Remote", url: shareUrl });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Remote link copied!");
    } catch {
      showToast(`Room code: ${code}`);
    }
  });

  startCameraBtn.addEventListener("click", () => enterRole("camera"));
  startRemoteBtn.addEventListener("click", () => enterRole("remote"));
  cameraExitBtn.addEventListener("click", exitToLobby);
  remoteExitBtn.addEventListener("click", exitToLobby);

  remoteRotateBtn.addEventListener("click", () => {
    remoteRotation = (remoteRotation + 90) % 360;
    applyRemoteVideoTransform();
    const payload = { type: "rotate", angle: remoteRotation };
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify(payload));
    } else {
      sendSignal(payload);
    }
    showToast(`Rotated ${remoteRotation}°`);
  });

  flipCameraBtn.addEventListener("click", async () => {
    facingMode = facingMode === "environment" ? "user" : "environment";
    try {
      await startCameraStream();
    } catch {
      showToast("Could not switch camera");
    }
  });

  cameraLocalSnapBtn.addEventListener("click", captureAndSendPhoto);
  remoteSnapBtn.addEventListener("click", triggerRemoteSnap);

  zoomSlider.addEventListener("input", () => sendRemoteZoom(zoomSlider.value));
  zoomInBtn.addEventListener("click", () => sendRemoteZoom(Number(zoomSlider.value) + 0.5));
  zoomOutBtn.addEventListener("click", () => sendRemoteZoom(Number(zoomSlider.value) - 0.5));

  // Laptop keyboard shortcuts when acting as Remote
  document.addEventListener("keydown", (e) => {
    if (currentRole !== "remote" || !photoModal.classList.contains("hidden")) return;
    if (e.code === "Space" || e.code === "Enter") {
      if (!remoteSnapBtn.disabled) {
        e.preventDefault();
        triggerRemoteSnap();
      }
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      sendRemoteZoom(Number(zoomSlider.value) + 0.5);
    } else if (e.key === "-") {
      e.preventDefault();
      sendRemoteZoom(Number(zoomSlider.value) - 0.5);
    }
  });

  timerBtn.addEventListener("click", () => {
    const cycle = [0, 3, 5];
    timerSeconds = cycle[(cycle.indexOf(timerSeconds) + 1) % cycle.length];
    timerBtn.textContent = `${timerSeconds}s`;
  });

  function openPhotoModal() {
    if (capturedPhotos.length === 0) return;
    exitCropMode();
    selectedPhotoIndex = capturedPhotos.length - 1;
    renderModalPhoto();
    photoModal.classList.remove("hidden");
  }

  // Interactive Crop on Remote
  let cropRect = null; // { x, y, w, h } in overlay CSS pixels
  let cropDragStart = null;

  function renderCropBox() {
    if (!cropRect) {
      cropBox.style.display = "none";
      return;
    }
    cropBox.style.display = "block";
    cropBox.style.left = `${cropRect.x}px`;
    cropBox.style.top = `${cropRect.y}px`;
    cropBox.style.width = `${cropRect.w}px`;
    cropBox.style.height = `${cropRect.h}px`;
  }

  function startCropMode() {
    if (!capturedPhotos[selectedPhotoIndex]) return;
    cropOverlay.classList.remove("hidden");
    cropBar.classList.remove("hidden");
    const rect = cropOverlay.getBoundingClientRect();
    cropRect = {
      x: rect.width * 0.1,
      y: rect.height * 0.1,
      w: rect.width * 0.8,
      h: rect.height * 0.8,
    };
    renderCropBox();
  }

  function exitCropMode() {
    cropOverlay.classList.add("hidden");
    cropBar.classList.add("hidden");
    cropRect = null;
    cropDragStart = null;
  }

  cropOverlay.addEventListener("pointerdown", (e) => {
    const bounds = cropOverlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, e.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, e.clientY - bounds.top));
    cropDragStart = { x, y };
    cropRect = { x, y, w: 0, h: 0 };
    cropOverlay.setPointerCapture(e.pointerId);
    renderCropBox();
  });

  cropOverlay.addEventListener("pointermove", (e) => {
    if (!cropDragStart) return;
    const bounds = cropOverlay.getBoundingClientRect();
    const cx = Math.max(0, Math.min(bounds.width, e.clientX - bounds.left));
    const cy = Math.max(0, Math.min(bounds.height, e.clientY - bounds.top));
    cropRect = {
      x: Math.min(cropDragStart.x, cx),
      y: Math.min(cropDragStart.y, cy),
      w: Math.abs(cx - cropDragStart.x),
      h: Math.abs(cy - cropDragStart.y),
    };
    renderCropBox();
  });

  cropOverlay.addEventListener("pointerup", () => {
    cropDragStart = null;
  });

  cropCancelBtn.addEventListener("click", exitCropMode);

  cropApplyBtn.addEventListener("click", async () => {
    const item = capturedPhotos[selectedPhotoIndex];
    if (!item || !cropRect || cropRect.w < 12 || cropRect.h < 12) {
      showToast("Drag on image to select crop area");
      return;
    }
    try {
      const bounds = cropOverlay.getBoundingClientRect();
      const resp = await fetch(item.url);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);

      const scaleX = bitmap.width / bounds.width;
      const scaleY = bitmap.height / bounds.height;
      const sx = Math.round(cropRect.x * scaleX);
      const sy = Math.round(cropRect.y * scaleY);
      const sw = Math.max(1, Math.round(cropRect.w * scaleX));
      const sh = Math.max(1, Math.round(cropRect.h * scaleY));

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      bitmap.close();

      const croppedBlob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.94));
      const newUrl = URL.createObjectURL(croppedBlob);
      URL.revokeObjectURL(item.url);
      item.url = newUrl;
      if (selectedPhotoIndex === capturedPhotos.length - 1) {
        remoteThumb.src = newUrl;
      }
      exitCropMode();
      renderModalPhoto();
      showToast("Cropped!");
    } catch {
      showToast("Could not crop image");
    }
  });

  async function blobUrlToBase64(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function submitPhotosToClaude() {
    if (capturedPhotos.length === 0) {
      showToast("Capture 1 or more photos first");
      return;
    }
    photoModal.classList.add("hidden");
    answerModal.classList.remove("hidden");
    answerLoading.classList.remove("hidden");
    answerBody.textContent = "";
    answerModel.textContent = "";
    answerNextBtn.disabled = true;

    try {
      const images = await Promise.all(
        capturedPhotos.map(async (item) => ({
          data: await blobUrlToBase64(item.url),
          mediaType: "image/jpeg",
        }))
      );

      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          prompt: "Based on the images find the answer for the question",
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Failed to get answer from Claude");
      }
      answerModel.textContent = data.model || "";
      answerBody.textContent = data.answer || "No answer returned.";
    } catch (err) {
      answerBody.textContent = `Error: ${err.message}`;
    } finally {
      answerLoading.classList.add("hidden");
      answerNextBtn.disabled = false;
    }
  }

  remoteGalleryBtn.addEventListener("click", openPhotoModal);
  remoteSubmitBtn.addEventListener("click", submitPhotosToClaude);
  modalSubmitBtn.addEventListener("click", submitPhotosToClaude);
  modalCropBtn.addEventListener("click", startCropMode);
  answerBackBtn.addEventListener("click", () => answerModal.classList.add("hidden"));
  answerNextBtn.addEventListener("click", () => {
    clearCapturedPhotos();
    showToast("Cleared previous photos — ready for next question!");
  });

  modalAddBtn.addEventListener("click", () => {
    exitCropMode();
    photoModal.classList.add("hidden");
    showToast("Ready to capture next image");
  });
  modalRotateBtn.addEventListener("click", async () => {
    const item = capturedPhotos[selectedPhotoIndex];
    if (!item) return;
    try {
      const resp = await fetch(item.url);
      const blob = await resp.blob();
      const rotatedBlob = await rotateImageBlob(blob, 90);
      const newUrl = URL.createObjectURL(rotatedBlob);
      URL.revokeObjectURL(item.url);
      item.url = newUrl;
      if (selectedPhotoIndex === capturedPhotos.length - 1) {
        remoteThumb.src = newUrl;
      }
      renderModalPhoto();
    } catch {
      showToast("Could not rotate photo");
    }
  });
  modalDownloadAllBtn.addEventListener("click", async () => {
    if (currentRole !== "remote" || capturedPhotos.length === 0) return;
    showToast(`Downloading ${capturedPhotos.length} photos…`);
    for (const item of capturedPhotos) {
      triggerDownload(item.url, item.filename);
      await new Promise((r) => setTimeout(r, 180));
    }
  });
  modalCloseBtn.addEventListener("click", () => {
    exitCropMode();
    photoModal.classList.add("hidden");
  });
  photoModal.querySelector(".modal-backdrop").addEventListener("click", () => {
    exitCropMode();
    photoModal.classList.add("hidden");
  });

  // Ensure live video keeps playing smoothly when phone rotates to horizontal/landscape
  const ensureVideoPlaying = () => {
    if (currentRole === "remote" && remoteVideo.srcObject) {
      remoteVideo.play().catch(() => {});
    } else if (currentRole === "camera" && cameraVideo.srcObject) {
      cameraVideo.play().catch(() => {});
    }
  };
  window.addEventListener("orientationchange", ensureVideoPlaying);
  window.addEventListener("resize", ensureVideoPlaying);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentRole === "camera") {
      requestWakeLock();
    }
  });

  // Init from URL query params (?room=4829&role=remote)
  const params = new URLSearchParams(location.search);
  const urlRoom = sanitizeRoom(params.get("room"));
  const urlRole = params.get("role");
  roomInput.value = urlRoom || generateRoomCode();

  if (urlRoom && (urlRole === "camera" || urlRole === "remote")) {
    enterRole(urlRole);
  }
})();

