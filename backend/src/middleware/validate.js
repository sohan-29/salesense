import ApiError from '../utils/ApiError.js';

/**
 * Validate `req.body`, `req.query`, or `req.params` against a zod schema.
 * On success, the parsed (coerced) value replaces the original.
 *
 *   validate.body(vendorRegisterSchema)
 */
const make = (source) => (schema) => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.flatten();
    return next(ApiError.badRequest('Validation failed', details));
  }
  req[source] = result.data;
  next();
};

export default {
  body: make('body'),
  query: make('query'),
  params: make('params'),
};
