import { auth } from '@clerk/nextjs/server';

export async function withUser(handler: (userId: string) => Promise<unknown>) {
  const session = await auth({ acceptsToken: ['session_token', 'api_key'] });
  if (!session.isAuthenticated || !session.userId) return Response.json({ error: 'No autorizado' }, { status: 401 });
  try {
    return Response.json(await handler(session.userId));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
