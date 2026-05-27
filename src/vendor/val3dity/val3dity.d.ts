type Val3dityModuleOptions = {
  locateFile?: (path: string, scriptDirectory: string) => string
}

type Val3dityValidationOptions = {
  tolSnap?: number
  tol_snap?: number
  planarityD2pTol?: number
  planarity_d2p_tol?: number
  planarityNTol?: number
  planarity_n_tol?: number
  overlapTol?: number
  overlap_tol?: number
  primitive?: 'Solid' | 'MultiSurface' | 'CompositeSurface'
}

type Val3dityModule = {
  module: unknown
  validateCityJSON(input: string, validationOptions?: Val3dityValidationOptions): unknown
  validateCityJSONSeq(input: string, validationOptions?: Val3dityValidationOptions): unknown
  validateRawArrays(
    vertices: number[] | Array<[number, number, number]>,
    faces: number[][] | number[][][],
    validationOptions?: Val3dityValidationOptions,
  ): unknown
}

export function createVal3dity(options?: Val3dityModuleOptions): Promise<Val3dityModule>

export default createVal3dity
