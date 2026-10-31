import type { LineModelRunner, ModelLines } from '@/lib/sources/photo';

// Informative Drawings (Chan, Durand & Isola, CVPR 2022, MIT licence), "line art" style, as
// ONNX. Both files are pinned to exact versions and downloaded on first use (the browser caches
// them): the runtime ~10 MB, the model 17 MB.
const ORT_VERSION = '1.20.1';
const ORT_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.js`;
const ORT_WASM = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL =
  'https://huggingface.co/rocca/informative-drawings-line-art-onnx/resolve/d38eccbd448cdcd228fb81d708506e5e60b41ccb/model.onnx';

type OrtTensor = { data: Float32Array; dims: number[] };
type Ort = {
  env: { wasm: { wasmPaths: string } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: {
    create(
      url: string
    ): Promise<{ run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> }>;
  };
};

let session: ReturnType<Ort['InferenceSession']['create']> | null = null;

function loadOrt(): Promise<Ort> {
  const existing = (globalThis as { ort?: Ort }).ort;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ORT_URL;
    script.onload = () => {
      const ort = (globalThis as { ort?: Ort }).ort;
      if (ort) resolve(ort);
      else reject(new Error('ONNX Runtime did not load.'));
    };
    script.onerror = () => reject(new Error('Could not download ONNX Runtime.'));
    document.head.appendChild(script);
  });
}

function getSession() {
  session ??= loadOrt().then((ort) => {
    ort.env.wasm.wasmPaths = ORT_WASM;
    return ort.InferenceSession.create(MODEL_URL);
  });
  // A failed download is retried next time instead of being cached.
  session.catch(() => (session = null));
  return session;
}

const runModel: LineModelRunner = async ({ data, width, height }): Promise<ModelLines> => {
  const ort = await loadOrt();
  const model = await getSession();
  // Planar RGB in 0..1, as the model was trained.
  const n = width * height;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    input[i] = data[i * 4] / 255;
    input[n + i] = data[i * 4 + 1] / 255;
    input[2 * n + i] = data[i * 4 + 2] / 255;
  }
  const { output } = await model.run({
    input: new ort.Tensor('float32', input, [1, 3, height, width]),
  });
  return { grey: Float32Array.from(output.data), width: output.dims[3], height: output.dims[2] };
};

/** The learned line-drawing model, run in the browser with ONNX Runtime Web. */
export function getLineModel(): LineModelRunner | undefined {
  return typeof document === 'undefined' ? undefined : runModel;
}
