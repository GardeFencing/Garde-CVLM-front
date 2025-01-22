<template>
  <div style="height: 100%;">
    <div v-if="!model" class="center-container">
      <v-progress-circular :size="80" :width="8" indeterminate color="black" class="loading-spinner"
        style="margin-bottom: 16px;"></v-progress-circular>
      <div>Loading model...</div>
    </div>

    <div v-else-if="showFencingImage" class="fencing-container">
      <div class="video-container">
        <video 
          ref="fencingVideo"
          class="fencing-video"
          :src="require('@/assets/En-Garde+Lunge - Made with Clipchamp.mp4')"
          @loadedmetadata="onVideoLoaded"
          @timeupdate="onTimeUpdate"
        ></video>
        <canvas id="eyeTrackingCanvas" class="eye-tracking-overlay" />
        <canvas id="heatmapCanvas" class="eye-tracking-overlay" v-show="showHeatmap" />
      </div>

      <div class="video-controls">
        <div class="frame-controls">
          <v-btn icon @click="previousFrame">
            <v-icon>mdi-skip-previous</v-icon>
          </v-btn>
          <v-btn icon @click="togglePlayPause">
            <v-icon>{{ isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon>
          </v-btn>
          <v-btn icon @click="nextFrame">
            <v-icon>mdi-skip-next</v-icon>
          </v-btn>
        </div>

        <div class="progress-container">
          <v-slider
            v-model="currentFrame"
            :min="0"
            :max="totalFrames"
            :step="1"
            hide-details
            @change="seekToFrame"
            class="frame-slider"
          >
            <template v-slot:prepend>
              <div class="frame-info">Frame: {{ currentFrame }}/{{ totalFrames }}</div>
            </template>
          </v-slider>
        </div>

        <div class="playback-controls">
          <v-btn-toggle v-model="playbackSpeed" mandatory>
            <v-btn value="0.25">0.25x</v-btn>
            <v-btn value="0.5">0.5x</v-btn>
            <v-btn value="1">1x</v-btn>
            <v-btn value="2">2x</v-btn>
          </v-btn-toggle>
        </div>
      </div>

      <div class="tracking-info">
        <div>Current Gaze Position: ({{ currentGazeX.toFixed(0) }}, {{ currentGazeY.toFixed(0) }})</div>
        <div v-if="showHeatmap" class="mt-2">
          Heatmap Intensity: {{ heatmapIntensity }}
          <div class="intensity-hint">(Use ↑↓ keys to adjust)</div>
        </div>
        <v-btn @click="stopTracking" color="error" class="mt-2">Stop Tracking</v-btn>
      </div>
    </div>

    <div v-else>
      <v-row justify="center" align="center" class="ma-0 justify-center align-center">
        <div v-if="index === 0" class="text-center"
          style="z-index: 1;position: absolute; top: 35%; left: 50%; transform: translate(-50%, -50%);">
          slowly press 'S' while looking at the point to begin
        </div>
        <div v-if="index === usedPattern.length - 1" class="text-center"
          style="z-index: 1;position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);"> press 'S' one
          more time</div>
        <div v-if="index === usedPattern.length" class="text-center" style="z-index: 1;">
          <div v-if="currentStep === 1"
            style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);">
            <div>
              you've collected {{ circleIrisPoints.length }} train points
            </div>
            <v-btn @click="endCalib()">End Calib</v-btn>
          </div>
          <div v-else style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);">
            <div>
              you've collected {{ calibPredictionPoints.length }} validation points
            </div>
            <v-btn @click="endCalib()">End Calib</v-btn>
          </div>
        </div>
      </v-row>
    </div>
    <canvas id="canvas" style="z-index: 0;" v-show="!showFencingImage" />
    <video 
      ref="videoElement" 
      id="video-tag" 
      autoplay 
      playsinline
      style="display: none;"
    ></video>
  </div>
</template>

<script>
export default {
  data() {
    return {
      // camera
      webcamfile: null,
      recordWebCam: null,
      configWebCam: {
        audio: false,
        video: true  // We'll set dimensions after mounting
      },
      videoWidth: 0,
      videoHeight: 0,
      
      // calibration
      circleIrisPoints: [],
      calibPredictionPoints: [],
      calibFinished: false,
      currentStep: 1,
      animationRefreshRate: 5,
      animationFrames: 100,
      innerCircleRadius: 5,
      usedPattern: [],
      showFencingImage: false,
      currentGazeX: 0,
      currentGazeY: 0,
      eyeTrackingInterval: null,
      gazeHistory: [],           // Current 5-second window data
      allGazeHistory: [],        // Accumulated data from all windows
      windowStartTime: null,     // Start time of current window
      showHeatmap: false,
      heatmapIntensity: 50,
      densityMap: {},           // Persistent density map
      analysisStartTime: null,
      sensitivityMultiplier: 1.5, // Adjust this value to change sensitivity
      previousGazePoints: [], // Store last few gaze points
      smoothingWindow: 3,    // Number of points to average
      calibrationMatrix: null, // Will store the linear transform parameters
      lastKnownGoodGaze: { x: 0, y: 0 },
      gazeVelocity: { x: 0, y: 0 },
      lastUpdateTime: null,
      predictionEnabled: true,
      stabilityThreshold: 5, // Minimum movement threshold in pixels
      movingAverageWindow: [], // Store recent stable positions
      maxMovingAveragePoints: 10,
      lastStablePosition: null,
      screenBounds: {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0
      },
      currentFrame: 0,
      totalFrames: 0,
      isPlaying: false,
      playbackSpeed: "1",
      frameRate: 30, // Assuming 30fps, adjust if needed
      lastFrameTime: 0
    };
  },
  computed: {
    radius() {
      return this.$store.state.calibration.radius
    },
    offset() {
      return this.$store.state.calibration.offset
    },
    predByPointCount() {
      return this.$store.state.calibration.samplePerPoint
    },
    pattern() {
      return this.$store.state.calibration.pattern
    },
    mockPattern() {
      return this.$store.state.calibration.mockPattern
    },
    backgroundColor() {
      return this.$store.state.calibration.backgroundColor
    },
    pointColor() {
      return this.$store.state.calibration.pointColor
    },
    leftEyeTreshold() {
      return this.$store.state.calibration.leftEyeTreshold
    },
    rightEyeTreshold() {
      return this.$store.state.calibration.rightEyeTreshold
    },
    index() {
      return this.$store.state.calibration.index
    },
    msPerCapture() {
      return this.$store.state.calibration.msPerCapture
    },
    model: {
      get() {
        return this.$store.state.detect.model
      },
      set() { }
    },
    isControlled() {
      return this.$store.state.calibration.isControlled
    },
  },
  created() {
    this.$store.commit('setIndex', 0);
    // Initialize usedPattern with safe default
    this.usedPattern = [];
    if (this.mockPattern && this.mockPattern.length > 0) {
      this.usedPattern = this.mockPattern;
    } else if (this.pattern && this.pattern.length > 0) {
      this.usedPattern = this.pattern;
    }
  },
  async mounted() {
    try {
      await this.startWebCamCapture();
      if (this.usedPattern && this.usedPattern.length > 0 && this.usedPattern[0]) {
        this.drawPoint(this.usedPattern[0].x, this.usedPattern[0].y, 1);
        this.advance(this.usedPattern, this.circleIrisPoints, this.msPerCapture);
      }
    } catch (error) {
      console.error('Error in mounted:', error);
    }
  },
  methods: {
    advance(pattern, whereToSave, timeBetweenCaptures) {
      const th = this;
      let currentIndex = 0;
      const dwellTime = 1000; // Reduced from 2000 to 1000 (1 second per point)

      const processPoint = async () => {
        if (currentIndex <= pattern.length - 1) {
          th.$store.commit('setIndex', currentIndex);
          await th.extract(pattern[currentIndex], timeBetweenCaptures);
          
          currentIndex++;
          if (currentIndex !== pattern.length) {
            // Trigger animation to next point
            await th.triggerAnimation(pattern[currentIndex - 1], pattern[currentIndex], this.animationRefreshRate);
            // Wait at the point for data collection
            setTimeout(processPoint, dwellTime);
          } else {
            th.$store.commit('setIndex', currentIndex);
            th.savePoint(whereToSave, th.usedPattern);
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      };

      // Start the process
      processPoint();
    },
    nextStep() {
      this.usedPattern.forEach(element => {
        delete element.data;
      });
      this.$store.commit('setIndex', 0);
      this.currentStep = 2;
      this.drawPoint(this.usedPattern[0].x, this.usedPattern[0].y, 1);
      this.advance(this.usedPattern, this.calibPredictionPoints, this.msPerCapture);
    },
    async extract(point, timeBetweenCaptures) {
      point.data = [];
      for (var a = 0; a < this.predByPointCount;) {
        const prediction = await this.detectFace();
        if (!prediction || !prediction[0]) {
          console.log('No face detected, retrying...');
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        const pred = prediction[0];
        
        // Safely access annotations
        if (!pred.annotations || !pred.annotations.leftEyeIris || !pred.annotations.rightEyeIris) {
          console.log('Eye features not detected, retrying...');
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        const leftIris = pred.annotations.leftEyeIris;
        const leftEyelid = pred.annotations.leftEyeUpper0?.concat(pred.annotations.leftEyeLower0);
        const rightIris = pred.annotations.rightEyeIris;
        const rightEyelid = pred.annotations.rightEyeUpper0?.concat(pred.annotations.rightEyeLower0);

        if (!leftEyelid || !rightEyelid) {
          console.log('Eyelid features not detected, retrying...');
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        const leftEyelidTip = leftEyelid[3];
        const leftEyelidBottom = leftEyelid[11];
        const rightEyelidTip = rightEyelid[3];
        const rightEyelidBottom = rightEyelid[11];

        const isLeftBlink = this.calculateDistance(leftEyelidTip, leftEyelidBottom) < this.leftEyeTreshold;
        const isRightBlink = this.calculateDistance(rightEyelidTip, rightEyelidBottom) < this.rightEyeTreshold;

        if (isLeftBlink || isRightBlink) {
          console.log('Eyes closed, disconsidered');
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        const newPrediction = { leftIris: leftIris[0], rightIris: rightIris[0] };
        point.data.push(newPrediction);
        const radius = (this.radius / this.predByPointCount) * a;
        this.drawPoint(point.x, point.y, radius);
        a++;
        
        await new Promise(resolve => setTimeout(resolve, timeBetweenCaptures));
      }
    },
    async triggerAnimation(origin, target, animationRefreshRate) {
      const frames = this.animationFrames;
      const deltaX = (target.x - origin.x) / frames;
      const deltaY = (target.y - origin.y) / frames;

      for (let d = 1; d <= frames; d++) {
        const xPosition = origin.x + deltaX * d;
        const yPosition = origin.y + deltaY * d;
        if (d == frames) {
          this.drawPoint(xPosition, yPosition, 1);
        } else {
          const radius = (this.radius / frames) * (frames - d);
          this.drawPoint(xPosition, yPosition, radius);
        }
        await new Promise(resolve => setTimeout(resolve, animationRefreshRate));
      }
    },
    calculateDistance(eyelidTip, eyelidBottom) {
      const xDistance = eyelidBottom[0] - eyelidTip[0];
      const yDistance = eyelidBottom[1] - eyelidTip[1];
      const distance = Math.sqrt(xDistance * xDistance + yDistance * yDistance);
      return distance;
    },
    drawPoint(x, y, radius) {
      const canvas = document.getElementById('canvas');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      //circle 
      ctx.beginPath();
      ctx.strokeStyle = this.pointColor;
      ctx.fillStyle = this.pointColor;
      ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2,
        false
      );
      ctx.stroke();
      ctx.fill();
      // inner circle
      ctx.beginPath();
      ctx.strokeStyle = "red";
      ctx.fillStyle = "red";
      ctx.arc(
        x,
        y,
        this.innerCircleRadius,
        0,
        Math.PI * 2,
        false
      );
      ctx.stroke();
      ctx.fill();
      // hollow circumference
      ctx.strokeStyle = this.pointColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, this.radius, 0, 2 * Math.PI, false);
      ctx.stroke();
    },
    async endCalib() {
      try {
        // Clean up prediction points
        this.calibPredictionPoints.forEach(element => {
          delete element.point_x;
          delete element.point_y;
        });

        // Generate mock predictions (for demonstration) 
        // so pattern has something in it.
        const predictions = {};
        this.usedPattern.forEach(point => {
          const x = point.x.toString().split('.')[0];
          const y = point.y.toString().split('.')[0];
          
          if (!predictions[x]) {
            predictions[x] = {};
          }
          
          // Dummy mock
          predictions[x][y] = {
            PrecisionSD: Math.random() * 2 + 1, // Random value
            Accuracy: Math.random() * 2 + 1,    // Random value
            predicted_x: point.x + (Math.random() * 20 - 10),
            predicted_y: point.y + (Math.random() * 20 - 10)
          };
        });

        // Update pattern with prediction data
        this.usedPattern.forEach(point => {
          const x = point.x.toString().split('.')[0];
          const y = point.y.toString().split('.')[0];
          const prediction = predictions[x][y];
          
          point.precision = prediction.PrecisionSD.toFixed(2);
          point.accuracy = prediction.Accuracy.toFixed(2);
          point.predictionX = prediction.predicted_x;
          point.predictionY = prediction.predicted_y;
        });

        // Process the collected data
        await this.$store.dispatch('extractXYValues', { 
          extract: this.circleIrisPoints, 
          hasCalib: true 
        });
        await this.$store.dispatch('extractXYValues', { 
          extract: this.calibPredictionPoints, 
          hasCalib: false 
        });

        // Stop any recording 
        if (this.recordWebCam && typeof this.recordWebCam.stop === 'function') {
          this.stopRecord();
        }

        // Start the fencing video view
        this.$store.commit('setMockPattern', []);
        this.showFencingImage = true;
        this.$nextTick(() => {
          this.initializeEyeTracking();
        });
      } catch (error) {
        console.error('Error in endCalib:', error);
      }
    },
    savePoint(whereToSave, patternLike) {
      patternLike.forEach(point => {
        point.data.forEach(element => {
          const data = {
            left_iris_x: element.leftIris[0],
            left_iris_y: element.leftIris[1],
            right_iris_x: element.rightIris[0],
            right_iris_y: element.rightIris[1],
            point_x: point.x,
            point_y: point.y,
          };
          whereToSave.push(data);
        });
      });
    },
    // canvas related
    async startWebCamCapture() {
      try {
        // Wait for video element to be available
        await this.$nextTick();
        const videoElement = this.$refs.videoElement;
        
        if (!videoElement) {
            throw new Error('Video element not found');
        }

        // Try different video constraints in order of preference
        const videoConstraints = [
          // First try ideal resolution
          {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user"
          },
          // Fallback to any resolution
          {
            facingMode: "user"
          },
          // Last resort - try without any constraints
          true
        ];

        let stream = null;
        let error = null;

        // Try each constraint until one works
        for (const constraints of videoConstraints) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: constraints
            });
            if (stream) break; // If we got a stream, exit the loop
          } catch (e) {
            error = e; // Store the last error
            console.warn('Failed with constraints:', constraints, 'Error:', e);
            continue; // Try next constraint set
          }
        }

        // If we still don't have a stream after trying all constraints
        if (!stream) {
          throw new Error(`Could not access webcam: ${error?.message || 'Unknown error'}`);
        }
        
        videoElement.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Video metadata load timeout'));
            }, 10000); // 10 second timeout

            videoElement.onloadedmetadata = () => {
                clearTimeout(timeoutId);
                videoElement.width = videoElement.videoWidth || 640;
                videoElement.height = videoElement.videoHeight || 480;
                this.videoWidth = videoElement.videoWidth;
                this.videoHeight = videoElement.videoHeight;
                resolve();
            };
        });

        // Wait for first frame
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Video data load timeout'));
            }, 10000); // 10 second timeout

            videoElement.onloadeddata = () => {
                clearTimeout(timeoutId);
                // Ensure video is playing
                videoElement.play().catch(error => {
                    console.error('Error playing video:', error);
                    reject(error);
                });
                resolve();
            };
        });

        // Wait a bit more to ensure everything is stable
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error('Error accessing webcam:', error);
        // Show user-friendly error message
        this.$store.dispatch('showError', {
          title: 'Camera Access Error',
          message: `Could not access webcam: ${error.message}. Please ensure:
          1. Your camera is properly connected
          2. You've granted camera permissions
          3. No other application is using the camera
          4. Try refreshing the page`
        });
        throw error;
      }
    },

    async detectFace() {
      try {
        const videoElement = this.$refs.videoElement;
        if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
          console.warn('Video not ready for face detection');
          return null;
        }

        if (!this.model) {
          console.warn('Face detection model not loaded');
          return null;
        }

        const prediction = await this.model.estimateFaces({
          input: videoElement,
        });

        if (!prediction || !prediction[0] || !prediction[0].annotations) {
          console.warn('No valid face detection results');
          return null;
        }

        return prediction;
      } catch (error) {
        console.error('Face detection error:', error);
        return null;
      }
    },

    stopRecord() {
      this.recordWebCam.state != "inactive" ? this.stopWebCamCapture() : null;
    },

    async stopWebCamCapture() {
      await this.recordWebCam.stop();
      this.calibFinished = true;
    },

    /**
     * -------------------------------------------------------------------------
     *  UPDATED: calculateCalibrationMatrix for LEAST SQUARES line-fitting 
     * -------------------------------------------------------------------------
     */
    calculateCalibrationMatrix() {
      const calibPoints = this.circleIrisPoints;
      if (!calibPoints || calibPoints.length === 0) return null;

      // We'll do a linear transform that maps:
      // avgIrisX, avgIrisY  -->  (screenX, screenY)
      //
      // For each calibration sample: 
      //    X_screen = a0 + a1*(avgIrisX) + a2*(avgIrisY)
      //    Y_screen = b0 + b1*(avgIrisX) + b2*(avgIrisY)
      
      const irisData = []; // [ [iris_x, iris_y, 1], [iris_x, iris_y, 1], ... ]
      const screenDataX = []; // [ targetX1, targetX2, ... ]
      const screenDataY = []; // [ targetY1, targetY2, ... ]

      // Fill up arrays with calibration data
      calibPoints.forEach(pt => {
        const avgX = (pt.left_iris_x + pt.right_iris_x) / 2;
        const avgY = (pt.left_iris_y + pt.right_iris_y) / 2;
        irisData.push([avgX, avgY, 1]); // the 1 is for constant offset
        screenDataX.push(pt.point_x);
        screenDataY.push(pt.point_y);
      });

      // Solve for [a1, a2, a0] = (A^T A)^(-1) A^T X (in matrix form)
      // We'll write a small helper that does least squares for each dimension
      function leastSquaresSolve(A, b) {
        // We want to solve A * params = b in a least-squares sense
        // Using normal eqn: (A^T * A) * params = A^T * b
        // A: Nx3  b: Nx1
        // We'll do a basic pseudo-inverse approach. For bigger projects, use mathjs or similar.

        const AT = mathTranspose(A);   // 3xN
        const ATA = mathMultiply(AT, A); // 3x3
        const ATb = mathMultiply(AT, b); // 3x1
        const ATAinv = mathInverse3x3(ATA); // 3x3
        const result = mathMultiply(ATAinv, ATb); // 3x1
        return result; // [ a1, a2, a0 ]
      }

      // Minimal matrix ops for 3x3 invert, multiply, etc.
      function mathTranspose(m) {
        // m is Nx3
        const rows = m.length;
        const cols = m[0].length;
        const t = [];
        for (let c = 0; c < cols; c++) {
          t[c] = [];
          for (let r = 0; r < rows; r++) {
            t[c][r] = m[r][c];
          }
        }
        return t;
      }
      function mathMultiply(m1, m2) {
        // naive multiply
        const r1 = m1.length;
        const c1 = m1[0].length;

        // If m2 is a vector, c2 might be undefined, handle that
        if (!Array.isArray(m2[0])) {
          // so we treat m2 as a Nx1 column vector
          const out = [];
          for (let i = 0; i < r1; i++) {
            let sum = 0;
            for (let j = 0; j < c1; j++) {
              sum += m1[i][j] * m2[j];
            }
            out.push(sum);
          }
          return out; // 1D array
        }

        // normal matrix multiply
        const c2 = m2[0].length;
        const result = [];
        for (let i = 0; i < r1; i++) {
          result[i] = [];
          for (let j = 0; j < c2; j++) {
            let sum = 0;
            for (let k = 0; k < c1; k++) {
              sum += m1[i][k] * m2[k][j];
            }
            result[i][j] = sum;
          }
        }
        return result;
      }
      function mathInverse3x3(m) {
        // m is 3x3
        const a = m[0][0], b = m[0][1], c = m[0][2];
        const d = m[1][0], e = m[1][1], f = m[1][2];
        const g = m[2][0], h = m[2][1], i = m[2][2];

        const A = e*i - f*h;
        const B = -(d*i - f*g);
        const C = d*h - e*g;
        const D = -(b*i - c*h);
        const E = a*i - c*g;
        const F = -(a*h - b*g);
        const G = b*f - c*e;
        const H = -(a*f - c*d);
        const I = a*e - b*d;

        const det = a*A + b*B + c*C;
        if (Math.abs(det) < 1e-12) {
          // fallback if not invertible
          console.warn("Matrix not invertible, returning identity transform");
          return [[1,0,0],[0,1,0],[0,0,1]];
        }

        const invdet = 1.0 / det;
        return [
          [A*invdet, D*invdet, G*invdet],
          [B*invdet, E*invdet, H*invdet],
          [C*invdet, F*invdet, I*invdet]
        ];
      }

      // Now let's solve for the transform:
      // Construct A from irisData (Nx3)
      //   Each row i is [ iris_x, iris_y, 1 ]
      // bX is array of screen X (length N)
      // bY is array of screen Y (length N)
      const A = irisData;
      const bX = screenDataX;
      const bY = screenDataY;

      const xParams = leastSquaresSolve(A, bX); // [ a1, a2, a0 ]
      const yParams = leastSquaresSolve(A, bY); // [ b1, b2, b0 ]

      // We can store these in an object
      return {
        xParams, // a1, a2, a0
        yParams  // b1, b2, b0
      };
    },

    initializeEyeTracking() {
      if (!this.$refs.fencingVideo) return;

      // Calculate calibration matrix first
      this.calibrationMatrix = this.calculateCalibrationMatrix();
      console.log('Calibration Matrix:', this.calibrationMatrix); // Debug log

      const videoElement = document.getElementById('video-tag');
      if (!videoElement || !this.$refs.fencingVideo) {
        console.error('Video element/fencingVideo not properly initialized');
        return;
      }

      const canvas = document.getElementById('eyeTrackingCanvas');
      const heatmapCanvas = document.getElementById('heatmapCanvas');
      const video = this.$refs.fencingVideo;
      
      [canvas, heatmapCanvas].forEach(c => {
        if (c) {
          c.width = video.videoWidth;
          c.height = video.videoHeight;
        }
      });

      this.showHeatmap = true;
      this.windowStartTime = Date.now();
      this.lastUpdateTime = Date.now();
      this.gazeHistory = [];
      this.densityMap = {};
      
      const checkVideoReady = () => {
        if (video.videoWidth && video.videoHeight) {
          const updateGaze = async () => {
            try {
              const prediction = await this.detectFace();
              if (prediction && prediction[0]) {
                const pred = prediction[0];
                const leftIris = pred.annotations.leftEyeIris[0];
                const rightIris = pred.annotations.rightEyeIris[0];

                if (leftIris && rightIris) {
                  this.updateGazePosition(leftIris, rightIris);
                }

                const now = Date.now();
                this.gazeHistory.push({ 
                  x: this.currentGazeX, 
                  y: this.currentGazeY,
                  timestamp: now
                });

                if (now - this.windowStartTime >= 5000) {
                  this.generateHeatmap();
                  this.gazeHistory = [];
                  this.windowStartTime = now;
                }

                if (canvas) {
                  this.drawGazeOverlay();
                }
              }
              requestAnimationFrame(updateGaze);
            } catch (error) {
              console.error('Eye tracking error:', error);
              requestAnimationFrame(updateGaze);
            }
          };
          
          requestAnimationFrame(updateGaze);
        } else {
          setTimeout(checkVideoReady, 100);
        }
      };
      
      checkVideoReady();
    },

    /**
     * -------------------------------------------------------------------------
     *  UPDATED: Use linear transform from calibrationMatrix for gaze position
     * -------------------------------------------------------------------------
     */
    updateGazePosition(leftIris, rightIris) {
      const fencingVideo = this.$refs.fencingVideo;
      if (!fencingVideo || !this.calibrationMatrix) {
        console.warn('Missing required elements or calibration for gaze tracking');
        return;
      }

      // Average left & right
      const avgX = (leftIris[0] + rightIris[0]) / 2;
      const avgY = (leftIris[1] + rightIris[1]) / 2;

      // Apply X transform
      //  X' = a0 + a1*avgX + a2*avgY
      const { xParams, yParams } = this.calibrationMatrix;
      const predX = xParams[2] + xParams[0]*avgX + xParams[1]*avgY;  // [a1, a2, a0]
      const predY = yParams[2] + yParams[0]*avgX + yParams[1]*avgY;  // [b1, b2, b0]

      // The predicted position in the fencing video space
      const scaledX = predX;
      const scaledY = predY;

      // Check if movement is significant enough
      const isSignificantMove = !this.lastStablePosition ||
        Math.sqrt(
          Math.pow(scaledX - this.lastStablePosition.x, 2) + 
          Math.pow(scaledY - this.lastStablePosition.y, 2)
        ) > this.stabilityThreshold;

      if (isSignificantMove) {
        this.lastStablePosition = { x: scaledX, y: scaledY };

        // Update moving average window
        this.movingAverageWindow.push(this.lastStablePosition);
        if (this.movingAverageWindow.length > this.maxMovingAveragePoints) {
          this.movingAverageWindow.shift();
        }

        // Calculate stable position using moving average
        const avgPosition = this.movingAverageWindow.reduce(
          (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
          { x: 0, y: 0 }
        );

        const stableX = avgPosition.x / this.movingAverageWindow.length;
        const stableY = avgPosition.y / this.movingAverageWindow.length;

        // Smooth final position
        const alpha = 0.3; // Lower alpha => more smoothing
        this.currentGazeX = alpha * stableX + (1 - alpha) * (this.currentGazeX || stableX);
        this.currentGazeY = alpha * stableY + (1 - alpha) * (this.currentGazeY || stableY);

        // Ensure within video bounds
        this.currentGazeX = Math.max(0, Math.min(this.currentGazeX, fencingVideo.videoWidth));
        this.currentGazeY = Math.max(0, Math.min(this.currentGazeY, fencingVideo.videoHeight));
      }
    },

    generateHeatmap() {
      const canvas = document.getElementById('heatmapCanvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const video = this.$refs.fencingVideo;
      if (!video) return;
      
      // Update density map with new points
      this.gazeHistory.forEach(point => {
        const key = Math.floor(point.x/10) + ',' + Math.floor(point.y/10);
        this.densityMap[key] = (this.densityMap[key] || 0) + 1;
      });

      // Clear canvas for redraw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Find max density for normalization
      const maxDensity = Math.max(...Object.values(this.densityMap), 1);
      
      // Draw accumulated heatmap
      ctx.globalAlpha = this.heatmapIntensity / 100;
      
      Object.entries(this.densityMap).forEach(([key, density]) => {
        const [x, y] = key.split(',').map(n => parseInt(n) * 10);
        const normalizedDensity = density / maxDensity;
        
        const gradient = ctx.createRadialGradient(
          x, y, 0,
          x, y, 30 * Math.sqrt(normalizedDensity) // Use sqrt for better visual scaling
        );
        
        gradient.addColorStop(0, `rgba(255, 0, 0, ${0.8 * normalizedDensity})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 0, ${0.4 * normalizedDensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 30 * Math.sqrt(normalizedDensity), 0, Math.PI * 2);
        ctx.fill();
      });
    },

    drawGazeOverlay() {
      const canvas = document.getElementById('eyeTrackingCanvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw only current window's gaze history
      this.gazeHistory.forEach(point => {
        const age = Date.now() - point.timestamp;
        const alpha = Math.max(0, 1 - (age / 5000)); // Fade over 5 seconds
        
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        ctx.fill();
      });

      // Draw current gaze point
      ctx.beginPath();
      ctx.arc(this.currentGazeX, this.currentGazeY, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'red';
      ctx.fill();
    },

    stopTracking() {
      if (this.eyeTrackingInterval) {
        clearInterval(this.eyeTrackingInterval);
      }
      this.$router.push('/postCalibration');
    },

    async validateCalibration() {
      // Optional method if you want to do further validation
      const validationPoints = [];
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      
      for (let x = 0.1; x <= 0.9; x += 0.2) {
        for (let y = 0.1; y <= 0.9; y += 0.2) {
          validationPoints.push({
            x: x * screenWidth,
            y: y * screenHeight
          });
        }
      }
      
      let totalError = 0;
      for (const point of validationPoints) {
        const prediction = await this.predictGazePoint();
        const error = Math.sqrt(
          Math.pow(prediction.x - point.x, 2) + 
          Math.pow(prediction.y - point.y, 2)
        );
        totalError += error;
      }
      
      const averageError = totalError / validationPoints.length;
      if (averageError > 50) {
        this.recalibrate();
      }
    },

    onVideoLoaded() {
      const video = this.$refs.fencingVideo;
      this.totalFrames = Math.floor(video.duration * this.frameRate);
      this.initializeEyeTracking();
      
      // Set up keyboard controls
      document.addEventListener('keydown', this.handleKeyPress);
    },

    onTimeUpdate() {
      const video = this.$refs.fencingVideo;
      this.currentFrame = Math.floor(video.currentTime * this.frameRate);
    },

    seekToFrame(frame) {
      const video = this.$refs.fencingVideo;
      video.currentTime = frame / this.frameRate;
      if (!this.isPlaying) {
        this.updateGazeForCurrentFrame();
      }
    },

    togglePlayPause() {
      const video = this.$refs.fencingVideo;
      if (this.isPlaying) {
        video.pause();
      } else {
        video.play();
      }
      this.isPlaying = !this.isPlaying;
    },

    previousFrame() {
      if (this.isPlaying) {
        this.togglePlayPause();
      }
      this.currentFrame = Math.max(0, this.currentFrame - 1);
      this.seekToFrame(this.currentFrame);
    },

    nextFrame() {
      if (this.isPlaying) {
        this.togglePlayPause();
      }
      this.currentFrame = Math.min(this.totalFrames - 1, this.currentFrame + 1);
      this.seekToFrame(this.currentFrame);
    },

    handleKeyPress(event) {
      switch(event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          this.previousFrame();
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.nextFrame();
          break;
        case ' ':
          event.preventDefault();
          this.togglePlayPause();
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.heatmapIntensity = Math.min(100, this.heatmapIntensity + 5);
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.heatmapIntensity = Math.max(0, this.heatmapIntensity - 5);
          break;
      }
    },

    async updateGazeForCurrentFrame() {
      const prediction = await this.detectFace();
      if (prediction && prediction[0]) {
        const pred = prediction[0];
        const leftIris = pred.annotations.leftEyeIris[0];
        const rightIris = pred.annotations.rightEyeIris[0];

        if (leftIris && rightIris) {
          this.updateGazePosition(leftIris, rightIris);
          this.drawGazeOverlay();
        }
      }
    },
  },

  watch: {
    playbackSpeed(newSpeed) {
      if (this.$refs.fencingVideo) {
        this.$refs.fencingVideo.playbackRate = parseFloat(newSpeed);
      }
    }
  },

  beforeDestroy() {
    document.removeEventListener('keydown', this.handleKeyPress);
    if (this.eyeTrackingInterval) {
      clearInterval(this.eyeTrackingInterval);
    }
  },
};
</script>

<style scoped>
body,
html {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.center-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.fencing-container {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
}

.fencing-video {
  max-width: 100%;
  max-height: 100vh;
  object-fit: contain;
}

.video-container {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
}

.video-controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  padding: 15px;
  border-radius: 8px;
  z-index: 1000;
  width: 80%;
  max-width: 800px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.frame-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 15px;
}

.frame-controls .v-btn {
  margin: 0 10px;
  background: rgba(255, 255, 255, 0.15);
}

.frame-controls .v-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.frame-controls .v-icon {
  color: white !important;
  font-size: 24px;
}

.progress-container {
  margin: 0 20px 15px;
}

.frame-slider {
  width: 100%;
}

.frame-info {
  color: white;
  font-size: 14px;
  min-width: 120px;
}

.playback-controls {
  display: flex;
  justify-content: center;
}

.playback-controls .v-btn-toggle {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.playback-controls .v-btn {
  color: white !important;
  min-width: 64px;
}

.playback-controls .v-btn.v-btn--active {
  background: rgba(255, 255, 255, 0.2) !important;
}

.tracking-info {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 15px;
  border-radius: 8px;
  z-index: 1000;
  min-width: 200px;
  backdrop-filter: blur(10px);
}

.intensity-hint {
  font-size: 0.8em;
  opacity: 0.8;
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.7);
}

.eye-tracking-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
