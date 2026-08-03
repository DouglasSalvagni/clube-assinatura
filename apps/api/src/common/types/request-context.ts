import { Request } from 'express';
import { Membership, Unit, User } from '../../database/entities';

export interface AuthenticatedRequest extends Request {
  user: User;
  unit?: Unit;
  membership?: Membership | null;
  unitId?: string;
  unitIds?: string[] | null;
}
