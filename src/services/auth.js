export default {
  signInWithGoogle: async () => {
    // Return mock user data
    return {
      displayName: 'Guest User',
      email: 'guest@example.com',
      uid: 'guest'
    };
  },

  getCurrentUser: () => {
    // Return mock user data
    return Promise.resolve({
      displayName: 'Guest User',
      email: 'guest@example.com',
      uid: 'guest'
    });
  },

  logout: async () => {
    // No-op since we're not using real authentication
    return Promise.resolve();
  },
};
