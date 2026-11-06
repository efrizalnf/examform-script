const SystemController = {
  routes() {
    return {
      'system.ping': { roles: null, handle: () => ({ app: APP.NAME, version: APP.VERSION, serverTime: Clock.iso() }) },
    };
  },
};
