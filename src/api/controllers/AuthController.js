const AuthController = {
  routes() {
    const any = [ROLE.ADMIN, ROLE.GURU, ROLE.SISWA];
    const auth = () => Container.get('authService');
    return {
      'auth.login': { roles: null, handle: (ctx, d) => auth().login(d) },
      'auth.me': { roles: any, handle: (ctx) => ctx.principal },
      'auth.changePassword': { roles: any, handle: (ctx, d) => auth().changePassword(ctx.principal, d) },
    };
  },
};
