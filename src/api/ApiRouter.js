/**
 * Dispatcher tunggal untuk SEMUA klien (Web admin/guru lewat google.script.run dan Android lewat HTTP POST).
 * Request : { action: "namespace.method", token?: "...", data?: {...} }
 * Response: { success: true, data } | { success: false, error: { code, message } }
 *
 * Menambah endpoint: tambahkan entri pada controller yang sesuai di src/api/controllers/.
 * Setiap rute: { roles: null (publik) | [ROLE...], handle(ctx, data) }.
 */
const ApiRouter = {
  _routes: null,

  routes() {
    if (!this._routes) {
      this._routes = Object.assign({},
        SystemController.routes(), AuthController.routes(), AdminController.routes(),
        SharedController.routes(), GuruController.routes(), SiswaController.routes());
    }
    return this._routes;
  },

  dispatch(request) {
    try {
      Validate.object(request, 'Request');
      const action = String(request.action || '');
      const route = this.routes()[action];
      if (!route) throw Errors.rule('UNKNOWN_ACTION', `Aksi tidak dikenal: ${action || '(kosong)'}.`);

      const ctx = { principal: null };
      if (route.roles) {
        const principal = Container.get('authService').authenticate(request.token);
        if (route.roles.indexOf(principal.role) < 0) throw Errors.forbidden();
        ctx.principal = principal;
      }
      const data = request.data === undefined || request.data === null ? {} : request.data;
      return ApiResponse.ok(route.handle(ctx, data));
    } catch (e) {
      if (e instanceof AppError) return ApiResponse.fail(e);
      Log.error('Kesalahan tak terduga', e, { action: request && request.action });
      return ApiResponse.fail(new AppError('INTERNAL_ERROR', 'Terjadi kesalahan pada server.'));
    }
  },

  /** Parse string JSON lalu dispatch. */
  dispatchJson(text) {
    let req;
    try {
      if (!text || text.length > 2 * 1024 * 1024) throw new Error('size');
      req = JSON.parse(text);
    } catch (e) {
      return ApiResponse.fail(Errors.validation('Body harus berupa JSON yang valid.'));
    }
    return this.dispatch(req);
  },
};
