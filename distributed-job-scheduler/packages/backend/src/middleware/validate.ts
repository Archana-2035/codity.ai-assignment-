import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiResponse } from '@djs/shared';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      data: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
    } as ApiResponse);
    return;
  }
  next();
}
