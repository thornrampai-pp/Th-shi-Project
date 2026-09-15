import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as authService from './auth.service';

export const authResolvers = {
  Mutation: {
    register: (
      _: unknown,
      args: { email: string; password: string; firstName?: string; lastName?: string },
    ) => authService.register(args.email, args.password, args.firstName, args.lastName),

    login: (_: unknown, args: { email: string; password: string }) =>
      authService.login(args.email, args.password),

    refreshToken: (_: unknown, args: { refreshToken: string }) =>
      authService.refreshAccessToken(args.refreshToken),

    logout: (_: unknown, args: { refreshToken: string }) => authService.logout(args.refreshToken),

    revokeAllSessions: (_: unknown, __: unknown, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return authService.revokeAllSessions(userId);
    },

    changePassword: (
      _: unknown,
      args: { oldPassword: string; newPassword: string },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      return authService.changePassword(userId, args.oldPassword, args.newPassword);
    },
  },
};
