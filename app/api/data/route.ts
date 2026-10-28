import { withUser } from '@/lib/auth';
import { load } from '@/lib/store';

export const GET = () =>
  withUser(async userId => {
    const { lists, blocks } = await load(userId);
    return { lists, blocks };
  });
