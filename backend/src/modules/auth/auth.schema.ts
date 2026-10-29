import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as authService from './auth.service';
import type { AuthPayload } from './auth.service';
import { UserType } from '../user/user.schema';

const AuthPayloadType = builder.objectRef<AuthPayload>('AuthPayload').implement({
  fields: (t) => ({
    accessToken: t.exposeString('accessToken'),
    refreshToken: t.exposeString('refreshToken'),
    user: t.field({ type: UserType, resolve: (payload) => payload.user }),
  }),
});

builder.mutationField('register', (t) =>
  t.field({
    type: AuthPayloadType,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      firstName: t.arg.string(),
      lastName: t.arg.string(),
    },
    resolve: (_root, args) =>
      authService.register(args.email, args.password, args.firstName ?? undefined, args.lastName ?? undefined),
  }),
);

builder.mutationField('login', (t) =>
  t.field({
    type: AuthPayloadType,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: (_root, args) => authService.login(args.email, args.password),
  }),
);

builder.mutationField('refreshToken', (t) =>
  t.field({
    type: AuthPayloadType,
    args: { refreshToken: t.arg.string({ required: true }) },
    resolve: (_root, args) => authService.refreshAccessToken(args.refreshToken),
  }),
);

builder.mutationField('logout', (t) =>
  t.field({
    type: 'Boolean',
    args: { refreshToken: t.arg.string({ required: true }) },
    resolve: (_root, args) => authService.logout(args.refreshToken),
  }),
);

builder.mutationField('revokeAllSessions', (t) =>
  t.field({
    type: 'Boolean',
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return authService.revokeAllSessions(userId);
    },
  }),
);

builder.mutationField('changePassword', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      oldPassword: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return authService.changePassword(userId, args.oldPassword, args.newPassword);
    },
  }),
);

// Always returns true (even if the email doesn't exist or isn't Discord-linked) so a
// caller can't use it to enumerate accounts.
builder.mutationField('forgotPassword', (t) =>
  t.field({
    type: 'Boolean',
    args: { email: t.arg.string({ required: true }) },
    resolve: (_root, args) => authService.forgotPassword(args.email),
  }),
);

builder.mutationField('resetPassword', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      token: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: (_root, args) => authService.resetPassword(args.token, args.newPassword),
  }),
);
