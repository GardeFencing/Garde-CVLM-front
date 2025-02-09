export default {
    state: {
        fixedTrainData: null,
        predictTrainData: null,
        prediction: null,
        model: null
    },
    mutations: {
        saveFixed(state, fixedTrainData) {
            state.fixedTrainData = fixedTrainData
        },
        savePredict(state, predictTrainData) {
            state.predictTrainData = predictTrainData
        },
        saveModel(state, model) {
            state.model = model
        },
        predictNow(state) {
            console.log(state)
        }
    },
    actions: {
        async trainModel(context, tf) {
            const rightX = tf.tensor2d(context.state.fixedTrainData.rightX, [context.state.fixedTrainData.rightX.length, 1]);
            const rightY = tf.tensor2d(context.state.fixedTrainData.rightY, [context.state.fixedTrainData.rightY.length, 1]);
            const leftX = tf.tensor2d(context.state.fixedTrainData.leftX, [context.state.fixedTrainData.leftX.length, 1]);
            const leftY = tf.tensor2d(context.state.fixedTrainData.leftY, [context.state.fixedTrainData.leftY.length, 1]);

            const xs = tf.concat([rightX, rightY, leftX, leftY], 1);
            const calibX = tf.tensor2d(context.state.fixedTrainData.calibX, [context.state.fixedTrainData.calibX.length, 1]);
            const calibY = tf.tensor2d(context.state.fixedTrainData.calibY, [context.state.fixedTrainData.calibY.length, 1]);
            const ys = tf.concat([calibX, calibY], 1);

            const model = tf.sequential();
            
            // Add more layers for better accuracy
            model.add(tf.layers.dense({ units: 32, inputShape: [4], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
            model.add(tf.layers.dense({ units: 2, activation: 'linear' }));

            // Use Adam optimizer for better convergence
            model.compile({ 
                optimizer: tf.train.adam(0.001),
                loss: 'meanSquaredError'
            });

            // Train with more epochs
            await model.fit(xs, ys, {
                epochs: 100,
                batchSize: 32,
                shuffle: true
            });

            xs.dispose();
            ys.dispose();
            context.commit('saveModel', model);
        },
        extractXYValues(context, data) {
            const hasCalib = data.hasCalib
            const extract = data.extract
            let receiver = {}
            if (hasCalib) {
                receiver = {
                    rightX: [],
                    rightY: [],
                    leftX: [],
                    leftY: [],
                    calibX: [],
                    calibY: [],
                }
            } else {
                receiver = {
                    rightX: [],
                    rightY: [],
                    leftX: [],
                    leftY: [],
                }
            }
            for (let i = 0; i < extract.length; i++) {
                const dataPoint = extract[i];
                receiver.rightX.push(dataPoint.right_iris_x)
                receiver.rightY.push(dataPoint.right_iris_y)
                receiver.leftX.push(dataPoint.left_iris_x)
                receiver.leftY.push(dataPoint.left_iris_y)
                if (hasCalib) {
                    receiver.calibX.push(dataPoint.point_x)
                    receiver.calibY.push(dataPoint.point_y)
                }
            }
            hasCalib ? context.commit('saveFixed', receiver) : context.commit('savePredict', receiver)
        },
    }
}