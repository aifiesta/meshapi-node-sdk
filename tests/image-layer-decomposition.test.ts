import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layerDecomposition,
  type LayerDecompositionParams,
} from '../src/imageLayerDecomposition';

test('layerDecomposition() enables the feature without options', () => {
  const params = layerDecomposition();
  assert.deepEqual(params, { layer_decomposition: true });
  assert.equal('layer_decomposition_options' in params, false);
});

test('layerDecomposition() serialises options with wire field names', () => {
  const params = layerDecomposition({ max_images: 10, text_recognition: true });
  const body = JSON.parse(JSON.stringify({ prompt: 'p', ...params }));
  assert.equal(body.layer_decomposition, true);
  assert.deepEqual(body.layer_decomposition_options, {
    max_images: 10,
    text_recognition: true,
  });
});

test('layerDecomposition() drops undefined option keys', () => {
  const params = layerDecomposition({ max_images: 5, text_recognition: undefined });
  assert.deepEqual(JSON.parse(JSON.stringify(params)), {
    layer_decomposition: true,
    layer_decomposition_options: { max_images: 5 },
  });
});

test('explicit false is a valid LayerDecompositionParams value', () => {
  const params: LayerDecompositionParams = { layer_decomposition: false };
  assert.deepEqual(JSON.parse(JSON.stringify(params)), { layer_decomposition: false });
});
