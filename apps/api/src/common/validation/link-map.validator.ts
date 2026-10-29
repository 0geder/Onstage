import { isURL, ValidateBy, type ValidationOptions } from 'class-validator';

const URL_MAX = 2048;

/**
 * Validates a `{ platform: url }` map: only the known platform keys, and every
 * value an absolute http(s) URL of bounded length. These links are rendered as
 * tappable buttons, so a `javascript:` value must never get through.
 */
export function IsLinkMap(
  allowedKeys: readonly string[],
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isLinkMap',
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          return Object.entries(value).every(
            ([key, url]) =>
              allowedKeys.includes(key) &&
              typeof url === 'string' &&
              url.length <= URL_MAX &&
              isURL(url, { protocols: ['https', 'http'], require_protocol: true }),
          );
        },
        defaultMessage: () =>
          `$property must map one of [${allowedKeys.join(', ')}] to an http(s) URL of at most ${URL_MAX} characters`,
      },
    },
    validationOptions,
  );
}
