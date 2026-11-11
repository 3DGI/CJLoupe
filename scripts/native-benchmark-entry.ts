import { parseCityJson as parseAppCityJson } from '../src/lib/cityjson'
// Benchmark the app-normalised model without retaining its app-owned source descriptor.
export function parseCityJson(text: string, name: string) {
  const dataset = parseAppCityJson(text, name)
  return { ...dataset, sources: dataset.sources.map(source => ({ ...source })) }
}
export { buildObjectGeometryBlueprint } from '../src/modules/cj-three/geometry'
