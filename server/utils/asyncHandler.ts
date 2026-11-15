import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps async Express 4 route handlers & middleware so rejected promises
 * forward cleanly to Express's central error middleware instead of hanging.
 */
export function asyncHandler<TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as TReq, res, next)).catch(next);
  };
}
