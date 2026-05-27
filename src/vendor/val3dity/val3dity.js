import createVal3dityModule from "./val3dity_wasm.mjs";

function encodeOptions(options) {
  return JSON.stringify(options ?? {});
}

export async function createVal3dity(options) {
  const module = await createVal3dityModule(options);

  return {
    module,

    validateCityJSON(input, validationOptions = {}) {
      return JSON.parse(
        module.validateCityJSONWithOptions(input, encodeOptions(validationOptions)),
      );
    },

    validateCityJSONSeq(input, validationOptions = {}) {
      return JSON.parse(
        module.validateCityJSONSeqWithOptions(input, encodeOptions(validationOptions)),
      );
    },

    validateRawArrays(vertices, faces, validationOptions = {}) {
      return JSON.parse(
        module.validateRawArraysWithOptions(vertices, faces, encodeOptions(validationOptions)),
      );
    },
  };
}

export default createVal3dity;
