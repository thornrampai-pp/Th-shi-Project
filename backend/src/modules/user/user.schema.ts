import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as userService from './user.service';
import type { UserShape } from './user.service';

export const UserRoleEnum = builder.enumType('UserRole', { values: ['USER', 'ADMIN'] as const });

export const UserType = builder.objectRef<UserShape>('User').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    firstName: t.exposeString('firstName', { nullable: true }),
    lastName: t.exposeString('lastName', { nullable: true }),
    imageUrl: t.exposeString('imageUrl', { nullable: true }),
    role: t.field({ type: UserRoleEnum, resolve: (u) => u.role as 'USER' | 'ADMIN' }),
    taxResidency: t.exposeString('taxResidency'),
    isActive: t.exposeBoolean('isActive'),
    createdAt: t.field({ type: 'String', resolve: (u) => u.createdAt.toISOString() }),
  }),
});

builder.queryField('me', (t) =>
  t.field({
    type: UserType,
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return userService.getUserById(userId);
    },
  }),
);

builder.mutationField('updateProfile', (t) =>
  t.field({
    type: UserType,
    args: {
      firstName: t.arg.string(),
      lastName: t.arg.string(),
      imageUrl: t.arg.string(),
      taxResidency: t.arg.string(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return userService.updateProfile(userId, {
        firstName: args.firstName ?? undefined,
        lastName: args.lastName ?? undefined,
        imageUrl: args.imageUrl ?? undefined,
        taxResidency: args.taxResidency ?? undefined,
      });
    },
  }),
);

builder.mutationField('deactivateAccount', (t) =>
  t.field({
    type: 'Boolean',
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return userService.deactivateAccount(userId);
    },
  }),
);

builder.mutationField('generateDiscordLinkCode', (t) =>
  t.field({
    type: 'String',
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return userService.generateDiscordLinkCode(userId);
    },
  }),
);
