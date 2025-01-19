import axios from 'axios';
import router from '@/router';

// Helper function to generate unique IDs
const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

export default {
    state: {
        calibName: '',
        pointNumber: 9,
        samplePerPoint: 40,
        radius: 15,
        offset: 40,
        backgroundColor: '#FFFFFFFF',
        pointColor: '#000000FF',
        customColors: false,
        blinkFilter: true,
        leftEyeTreshold: 3.5,
        rightEyeTreshold: 3.5,
        index: 0,
        msPerCapture: 5,
        pattern: [],
        mockPattern: [],
        threshold: 150,
        calibrations: [],
        fromDashboard: false,
    },
    mutations: {
        setThreshold(state, newThreshold) {
            state.threshold = newThreshold;
        },
        setCalibName(state, newCalibName) {
            state.calibName = newCalibName;
        },
        setSamplePerPoint(state, newSamplePerPoint) {
            state.samplePerPoint = newSamplePerPoint;
        },
        setRadius(state, newRadius) {
            state.radius = newRadius;
        },
        setOffset(state, newOffset) {
            state.offset = newOffset;
        },
        setPointNumber(state, newPointNumber) {
            state.pointNumber = newPointNumber;
        },
        setPattern(state, newPattern) {
            state.pattern = newPattern;
        },
        setMockPatternElement(state, newPatternLike) {
            if (!state.mockPattern.includes(newPatternLike)) {
                state.mockPattern.push(newPatternLike)
            } else {
                const index = state.mockPattern.indexOf(newPatternLike);
                state.mockPattern.splice(index, 1);
            }
        },
        setMockPattern(state, newMockPattern) {
            state.mockPattern = newMockPattern
        },
        setBackgroundColor(state, newBackgroundColor) {
            state.backgroundColor = newBackgroundColor
        },
        setPointColor(state, newPointColor) {
            state.pointColor = newPointColor
        },
        setCustomColors(state, newCustomColors) {
            state.customColors = newCustomColors
        },
        setBlinkFilter(state, newBlinkFilter) {
            state.blinkFilter = newBlinkFilter
        },
        setLeftTreshold(state, newLeftTreshold) {
            state.leftEyeTreshold = newLeftTreshold
        },
        setRightTreshold(state, newRightTreshold) {
            state.rightEyeTreshold = newRightTreshold
        },
        setIndex(state, newIndex) {
            state.index = newIndex
        },
        setMsPerCapture(state, newMsPerCapture) {
            state.msPerCapture = newMsPerCapture
        },
        setCalibrations(state, newCalibrations) {
            state.calibrations = newCalibrations
        },
        setFromDashboard(state, newFromDashboard) {
            state.fromDashboard = newFromDashboard
        },
        resetAll(state) {
            state.calibName = ''
            state.pointNumber = 5
            state.samplePerPoint = 20
            state.radius = 20
            state.offset = 50
            state.backgroundColor = '#FFFFFFFF'
            state.pointColor = '#000000FF'
            state.customColors = false
            state.blinkFilter = true
            state.leftEyeTreshold = 5
            state.rightEyeTreshold = 5
            state.index = 0
            state.msPerCapture = 10
            state.pattern = []
            state.mockPattern = []
            state.threshold = 200
            state.calibrations = []
            state.fromDashboard = false
        },
    },
    actions: {
        async saveCalib(context) {
            const state = context.state;
            const calibrationData = { ...state, id: generateId() };
            delete calibrationData.calibrations;
            
            try {
                // Get existing calibrations from localStorage
                const existingCalibs = JSON.parse(localStorage.getItem('calibrations') || '[]');
                existingCalibs.push(calibrationData);
                localStorage.setItem('calibrations', JSON.stringify(existingCalibs));
                
                console.log('Data successfully saved to local storage!');
                context.dispatch('getAllCalibs');
            } catch (error) {
                console.error('Error saving data to local storage:', error);
            }
        },
        async selectCalib({ commit }, calibData) {
            commit('setThreshold', calibData.threshold)
            commit('setCalibName', calibData.calibName)
            commit('setSamplePerPoint', calibData.samplePerPoint)
            commit('setRadius', calibData.radius)
            commit('setOffset', calibData.offset)
            commit('setPointNumber', calibData.pointNumber)
            commit('setPattern', calibData.pattern)
            commit('setMockPattern', calibData.mockPattern)
            commit('setBackgroundColor', calibData.backgroundColor)
            commit('setPointColor', calibData.pointColor)
            commit('setCustomColors', calibData.customColors)
            commit('setBlinkFilter', calibData.blinkFilter)
            commit('setLeftTreshold', calibData.leftTreshold)
            commit('setRightTreshold', calibData.rightTreshold)
            commit('setIndex', calibData.index)
            commit('setMsPerCapture', calibData.msPerCapture)
            router.push('/postCalibration')
        },
        async getAllCalibs({ commit }) {
            try {
                const calibrations = JSON.parse(localStorage.getItem('calibrations') || '[]');
                
                // Calculate averages
                calibrations.forEach(data => {
                    var averageAccuracy = 0;
                    var averagePrecision = 0;
                    data.pattern.forEach(element => {
                        averageAccuracy += Number(element.accuracy);
                        averagePrecision += Number(element.precision);
                    });
                    data.averageAccuracy = averageAccuracy / data.pattern.length;
                    data.averagePrecision = averagePrecision / data.pattern.length;
                });

                commit('setCalibrations', calibrations);
            } catch (error) {
                console.error('Error getting calibrations:', error);
                throw error;
            }
        },
        async deleteCalib({ dispatch }, calib) {
            try {
                const calibrations = JSON.parse(localStorage.getItem('calibrations') || '[]');
                const filteredCalibs = calibrations.filter(c => c.id !== calib.id);
                localStorage.setItem('calibrations', JSON.stringify(filteredCalibs));
                dispatch('getAllCalibs');
            } catch (error) {
                console.error('Error deleting calibration:', error);
                return { success: false, message: 'Failed to delete calibration' };
            }
        },
        async sendData(context, data) {
            let formData = new FormData();
            formData.append(
                "file_name",
                JSON.stringify(context.state.calibName)
            )
            formData.append(
                "fixed_circle_iris_points",
                JSON.stringify(data.circleIrisPoints)
            );
            formData.append(
                "calib_circle_iris_points",
                JSON.stringify(data.calibPredictionPoints)
            );
            formData.append("screen_height",
                JSON.stringify(data.screenHeight)
            );
            formData.append("screen_width",
                JSON.stringify(data.screenWidth)
            );
            formData.append("k", JSON.stringify(data.k));
            const res = await axios.post(`/api/session/calib_validation`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });
            return res.data
            // console.log(res);
        }
    },
}