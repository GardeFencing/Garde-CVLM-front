export default {
  state: {
    user: { displayName: 'Guest User', email: 'guest@example.com', uid: 'guest' },
    loading: false,
  },
  getters: {
    getLoading(state) {
      return state.loading;
    },
    getUser(state) {
      return state.user;
    },
  },
  mutations: {
    setUser(state, payload) {
      state.user = payload;
    },
    setLoading(state, payload) {
      state.loading = payload;
    },
  },
  actions: {
    async signinwithgoogle({ commit }) {
      // Skip authentication and return default user
      const defaultUser = { displayName: 'Guest User', email: 'guest@example.com', uid: 'guest' };
      commit("setUser", defaultUser);
      return defaultUser;
    },
    async autoSignIn({ commit }) {
      // Return default user without authentication
      const defaultUser = { displayName: 'Guest User', email: 'guest@example.com', uid: 'guest' };
      commit("setUser", defaultUser);
      return defaultUser;
    },
  },
};
