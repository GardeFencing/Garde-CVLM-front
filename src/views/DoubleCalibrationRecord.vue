<template>
  <div style="height: 100%;">
    <div v-if="!model" class="center-container">
      <v-progress-circular :size="80" :width="8" indeterminate color="black" class="loading-spinner"
        style="margin-bottom: 16px;"></v-progress-circular>
      <div>Loading model...</div>
    </div>

    <div v-else-if="showFencingImage" class="fencing-container">
      <img src="@/assets/IMG_9082.jpg" alt="Fencing" class="fencing-image" ref="fencingImage" @load="initializeEyeTracking"/>
      <canvas id="eyeTrackingCanvas" class="eye-tracking-overlay" />
      <canvas id="heatmapCanvas" class="eye-tracking-overlay" v-show="showHeatmap" />
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
      animationRefreshRate: 10,
      animationFrames: 250,
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
      const th = this
      var i = 0
      async function keydownHandler(event) {
        if ((event.key === "s" || event.key === "S")) {
          if (i <= pattern.length - 1) {
            document.removeEventListener('keydown', keydownHandler)
            await th.extract(pattern[i], timeBetweenCaptures)

            th.$store.commit('setIndex', i)
            i++
            if (i != pattern.length) {
              await th.triggerAnimation(pattern[i - 1], pattern[i], this.animationRefreshRate)
            }
            document.addEventListener('keydown', keydownHandler)
          } else {
            th.$store.commit('setIndex', i)
            document.removeEventListener('keydown', keydownHandler)
            th.savePoint(whereToSave, th.usedPattern)
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          }
        }
      }
      document.addEventListener('keydown', keydownHandler)
    },
    nextStep() {
      this.usedPattern.forEach(element => {
        delete element.data;
      });
      this.$store.commit('setIndex', 0)
      this.currentStep = 2
      this.drawPoint(this.usedPattern[0].x, this.usedPattern[0].y, 1)
      this.advance(this.usedPattern, this.calibPredictionPoints, this.msPerCapture)
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
      const frames = this.animationFrames
      const deltaX = (target.x - origin.x) / frames;
      const deltaY = (target.y - origin.y) / frames;

      for (let d = 1; d <= frames; d++) {
        const xPosition = origin.x + deltaX * d;
        const yPosition = origin.y + deltaY * d;
        if (d == frames) {
          this.drawPoint(xPosition, yPosition, 1);
        } else {
          const radius = (this.radius / frames) * (frames - d)
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
      canvas.height = window.innerHeight
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height)
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

        // Generate mock predictions locally
        const predictions = {};
        this.usedPattern.forEach(point => {
          const x = point.x.toString().split('.')[0];
          const y = point.y.toString().split('.')[0];
          
          if (!predictions[x]) {
            predictions[x] = {};
          }
          
          // Generate mock prediction data
          predictions[x][y] = {
            PrecisionSD: Math.random() * 2 + 1, // Random value between 1-3
            Accuracy: Math.random() * 2 + 1,    // Random value between 1-3
            predicted_x: point.x + (Math.random() * 20 - 10), // Original x ± 10px
            predicted_y: point.y + (Math.random() * 20 - 10)  // Original y ± 10px
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

        // Clean up and navigate
        if (this.recordWebCam && typeof this.recordWebCam.stop === 'function') {
          this.stopRecord();
        }
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
          }
          whereToSave.push(data)
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

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            }
        });
        
        videoElement.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.width = 640;
                videoElement.height = 480;
                this.videoWidth = videoElement.videoWidth;
                this.videoHeight = videoElement.videoHeight;
                resolve();
            };
        });

        // Wait for first frame
        await new Promise((resolve) => {
            videoElement.onloadeddata = () => {
                // Ensure video is playing
                videoElement.play().catch(console.error);
                resolve();
            };
        });

        // Wait a bit more to ensure everything is stable
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error('Error accessing webcam:', error);
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

    initializeEyeTracking() {
      if (!this.$refs.fencingImage) return;

      const videoElement = document.getElementById('video-tag');
      if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
        console.error('Video element not properly initialized');
        return;
      }

      const canvas = document.getElementById('eyeTrackingCanvas');
      const heatmapCanvas = document.getElementById('heatmapCanvas');
      const img = this.$refs.fencingImage;
      
      // Set both canvas sizes to match image
      [canvas, heatmapCanvas].forEach(c => {
        if (c) {
          c.width = img.width;
          c.height = img.height;
        }
      });

      // Reset tracking data
      this.showHeatmap = true;
      this.windowStartTime = Date.now();
      this.gazeHistory = [];
      this.densityMap = {};
      
      // Start continuous eye tracking with a slight delay to ensure video is ready
      setTimeout(() => {
        this.eyeTrackingInterval = setInterval(async () => {
          try {
            if (!videoElement.videoWidth || !videoElement.videoHeight) {
              console.warn('Video dimensions not ready');
              return;
            }

            const prediction = await this.detectFace();
            if (prediction && prediction[0]) {
              const pred = prediction[0];
              const leftIris = pred.annotations.leftEyeIris[0];
              const rightIris = pred.annotations.rightEyeIris[0];

              this.updateGazePosition(leftIris, rightIris);

              const now = Date.now();
              
              // Add to current window's gaze history
              this.gazeHistory.push({ 
                x: this.currentGazeX, 
                y: this.currentGazeY,
                timestamp: now
              });

              // Check if current 5-second window is complete
              if (now - this.windowStartTime >= 5000) {
                this.generateHeatmap();
                this.gazeHistory = [];
                this.windowStartTime = now;
              }

              // Draw current gaze point and trail
              if (canvas) {
                this.drawGazeOverlay();
              }
            }
          } catch (error) {
            console.error('Eye tracking error:', error);
          }
        }, 25);
      }, 1000); // 1 second delay to ensure video is fully initialized
    },

    updateGazePosition(leftIris, rightIris) {
      const videoElement = document.getElementById('video-tag');
      const fencingImage = this.$refs.fencingImage;
      
      if (!videoElement || !fencingImage) return;
      
      // Calculate center point between eyes
      const newX = (leftIris[0] + rightIris[0]) / 2;
      const newY = (leftIris[1] + rightIris[1]) / 2;
      
      // Calculate eye distance for scaling
      const eyeDistance = Math.sqrt(
          Math.pow(rightIris[0] - leftIris[0], 2) + 
          Math.pow(rightIris[1] - leftIris[1], 2)
      );
      
      // Get the neutral position (center of video)
      const centerX = videoElement.videoWidth / 2;
      const centerY = videoElement.videoHeight / 2;
      
      // Calculate offset from center, normalized by eye distance
      const offsetX = (newX - centerX) / eyeDistance;
      const offsetY = (newY - centerY) / eyeDistance;
      
      // Apply non-linear scaling for better edge response
      const scaledX = Math.sign(offsetX) * Math.pow(Math.abs(offsetX) * 3, 1.5);
      const scaledY = Math.sign(offsetY) * Math.pow(Math.abs(offsetY) * 3, 1.5);
      
      // Map to image dimensions with enhanced range
      const mappedX = (0.5 + scaledX) * fencingImage.width;
      const mappedY = (0.5 + scaledY) * fencingImage.height;
      
      // Apply smoothing
      this.previousGazePoints.push({x: mappedX, y: mappedY});
      if (this.previousGazePoints.length > this.smoothingWindow) {
          this.previousGazePoints.shift();
      }
      
      // Weighted average (recent points have more weight)
      let totalWeight = 0;
      let weightedX = 0;
      let weightedY = 0;
      
      this.previousGazePoints.forEach((point, index) => {
          const weight = (index + 1);
          weightedX += point.x * weight;
          weightedY += point.y * weight;
          totalWeight += weight;
      });
      
      this.currentGazeX = weightedX / totalWeight;
      this.currentGazeY = weightedY / totalWeight;
      
      // Ensure coordinates stay within bounds
      this.currentGazeX = Math.max(0, Math.min(this.currentGazeX, fencingImage.width));
      this.currentGazeY = Math.max(0, Math.min(this.currentGazeY, fencingImage.height));
    },

    generateHeatmap() {
      const canvas = document.getElementById('heatmapCanvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = this.$refs.fencingImage;
      if (!img) return;
      
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
      const validationPoints = [];
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      
      // Test points in a grid
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
      if (averageError > 50) { // 50 pixels threshold
          // Recalibrate if accuracy is poor
          this.recalibrate();
      }
    },
  },

  beforeDestroy() {
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

.fencing-image {
  max-width: 100%;
  max-height: 100vh;
  object-fit: contain;
}

.eye-tracking-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.tracking-info {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px;
  border-radius: 8px;
  z-index: 1000;
  min-width: 200px;
}

.intensity-hint {
  font-size: 0.8em;
  opacity: 0.8;
  margin-top: 4px;
}
</style>
