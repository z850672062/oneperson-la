export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (message = '未登录或登录已过期') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = '无权限执行该操作') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = '资源不存在') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message = '资源冲突') => new AppError(409, 'CONFLICT', message);

export const categoryNotEmpty = (message = '该分类下存在子分类或记录，无法删除') =>
  new AppError(409, 'CATEGORY_NOT_EMPTY', message);

export const validationError = (message = '参数校验失败') =>
  new AppError(422, 'VALIDATION_ERROR', message);
