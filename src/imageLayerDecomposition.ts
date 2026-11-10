/**
 * Layer decomposition parameters for image generation.
 *
 * Layer decomposition splits an input image into a base image plus a set of
 * PNG layers. It is only honoured by models that support the feature; sending
 * `layer_decomposition: true` to a model without it returns a 400 error.
 * Check `GET /v1/models` for model capabilities before enabling it.
 *
 * These fields are available on both `ImageGenerationRequest` (used by
 * `client.images.generate`) and `ImageOptions`.
 */

/**
 * Options that control how an input image is decomposed into layers.
 */
export interface LayerDecompositionOptions {
  /**
   * Maximum number of layers to return. The provider returns up to 99 layers.
   * When omitted, the provider default applies.
   */
  max_images?: number;
  /**
   * Ask the provider to recognise text inside each layer.
   */
  text_recognition?: boolean;
}

/**
 * Request fields that enable and configure layer decomposition.
 */
export interface LayerDecompositionParams {
  /**
   * Split the input image into a base image plus PNG layers.
   * An explicit `false` is accepted and has no effect.
   */
  layer_decomposition?: boolean;
  /**
   * Options for layer decomposition. Only read when `layer_decomposition` is `true`.
   */
  layer_decomposition_options?: LayerDecompositionOptions;
}

declare module './types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ImageGenerationRequest extends LayerDecompositionParams {}
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ImageOptions extends LayerDecompositionParams {}
}

/**
 * Build the request fields that turn on layer decomposition.
 *
 * @example
 * ```ts
 * const res = await client.images.generate({
 *   model,
 *   prompt: 'Split this poster into layers',
 *   ...layerDecomposition({ max_images: 10, text_recognition: true }),
 * });
 * ```
 *
 * @param options Optional decomposition options.
 * @returns An object to spread into an image request.
 */
export function layerDecomposition(
  options?: LayerDecompositionOptions,
): LayerDecompositionParams {
  const params: LayerDecompositionParams = { layer_decomposition: true };
  if (options !== undefined) {
    const cleaned: LayerDecompositionOptions = {};
    if (options.max_images !== undefined) cleaned.max_images = options.max_images;
    if (options.text_recognition !== undefined) cleaned.text_recognition = options.text_recognition;
    params.layer_decomposition_options = cleaned;
  }
  return params;
}
