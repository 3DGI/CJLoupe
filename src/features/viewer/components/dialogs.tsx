import {
  FileText
} from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type {
  ViewerDataset
} from '@/types/cityjson'

import type { Val3dityParameterForm, Val3dityPrimitiveOption } from '../presentation'
import { APP_VERSION, DEFAULT_VAL3DITY_PARAMETERS, formatCityJsonFileTabLabel, formatCoordinateTriple, formatCountLabel, formatDimensionValue, formatMetadataKey, formatMetadataPrimitive, formatOpenFileCount, isEmptyMetadataValue, isGeographicalExtentKey, isNumberArray, isValidVal3dityParameterValue, parseChangelog, summarizeValidation } from '../presentation'

export function InfoDialogContent({
  dataset,
  annotationSourceName,
  annotationSourceLocation,
}: {
  dataset: ViewerDataset
  annotationSourceName: string | null
  annotationSourceLocation: string | null
}) {
  const validationSummary = annotationSourceName ? summarizeValidation(dataset) : null
  const cityJsonTabs = dataset.sources.map((source, index) => ({
    source,
    index,
    value: `cityjson-${index}`,
    metadataEntries: source.metadata
      ? Object.entries(source.metadata).filter(([, value]) => !isEmptyMetadataValue(value))
      : [],
  }))
  const cityJsonSourceCount = cityJsonTabs.length
  const defaultInfoTab = cityJsonTabs[0]?.value ?? 'cityjson'

  return (
    <DialogContent
      closeLabel="Close information dialog"
      className="flex min-h-0 max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden p-0"
    >
      <DialogDescription className="sr-only">
        CityJSON source metadata and validation report details.
      </DialogDescription>
      <Tabs
        defaultValue={defaultInfoTab}
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      >
        <div className="border-b border-border bg-gradient-to-r from-primary/8 via-transparent to-transparent">
          <div className="flex items-start gap-4 p-5 pr-14">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                  File information
                </DialogTitle>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant="secondary" className="border-primary/10 bg-primary/10 text-primary">
                    {formatOpenFileCount(cityJsonSourceCount + (annotationSourceName ? 1 : 0))}
                  </Badge>
                  {annotationSourceName && <Badge variant="outline">Validation loaded</Badge>}
                </div>
              </div>
            </div>
          </div>

          <TabsList className="-mb-px max-w-full gap-0 overflow-x-auto px-5">
            {cityJsonTabs.map(({ source, index, value }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="detail-tab max-w-48 shrink-0 gap-1.5"
                title={source.name}
              >
                <span className="truncate">{formatCityJsonFileTabLabel(source.name, index, cityJsonSourceCount)}</span>
              </TabsTrigger>
            ))}
            {annotationSourceName && (
              <TabsTrigger
                value="val3dity"
                className="detail-tab max-w-48 shrink-0 gap-1.5"
                title={annotationSourceName}
              >
                <span className="truncate">{annotationSourceName}</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-5">
            {cityJsonTabs.map(({ source, value, metadataEntries }) => (
              <TabsContent key={value} value={value} className="mt-0 flex flex-col gap-4 data-hidden:hidden">
                <section>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    CityJSON
                  </p>
                  <dl className="mt-2.5 flex flex-col gap-2 text-sm">
                    <InfoRow label="Source" value={source.location} mono />
                    <InfoRow label="Type" value={source.cityJsonKind} />
                    <InfoRow label="Version" value={source.cityJsonVersion ?? '—'} />
                    <InfoRow label="Features" value={source.featureCount.toString()} mono />
                    {source.transform && (
                      <>
                        <InfoRow
                          label="Scale"
                          value={formatCoordinateTriple(source.transform.scale)}
                          mono
                        />
                        <InfoRow
                          label="Translate"
                          value={formatCoordinateTriple(source.transform.translate)}
                          mono
                        />
                      </>
                    )}
                  </dl>
                </section>

                {metadataEntries.length > 0 && (
                  <section>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Metadata
                    </p>
                    <dl className="mt-2.5 flex flex-col gap-2 text-sm">
                      {metadataEntries.map(([key, metadataValue]) => (
                        <InfoRow
                          key={key}
                          label={formatMetadataKey(key)}
                          value={<MetadataValue metadataKey={key} value={metadataValue} />}
                        />
                      ))}
                    </dl>
                  </section>
                )}
              </TabsContent>
            ))}

            {annotationSourceName && (
              <TabsContent value="val3dity" className="mt-0 flex flex-col gap-4 data-hidden:hidden">
                <section>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Val3dity report
                  </p>
                  <dl className="mt-2.5 flex flex-col gap-2 text-sm">
                    <InfoRow label="Source" value={annotationSourceLocation ?? annotationSourceName} mono />
                  </dl>
                </section>
                {validationSummary && (
                  <>
                    <section>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Summary
                      </p>
                      <dl className="mt-2.5 grid gap-2 text-sm sm:grid-cols-3">
                        <InfoRow label="Valid" value={validationSummary.validCount.toString()} mono />
                        <InfoRow label="Invalid" value={validationSummary.invalidCount.toString()} mono />
                        <InfoRow label="Errors" value={validationSummary.totalErrorCount.toString()} mono />
                      </dl>
                    </section>
                    <section>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Errors
                      </p>
                      {validationSummary.errorCounts.length > 0 ? (
                        <div className="mt-2.5 flex flex-col gap-2">
                          {validationSummary.errorCounts.map((error) => (
                            <div
                              key={`${error.code}:${error.description}`}
                              className="flex min-w-0 items-start justify-between gap-3 rounded-sm border border-border/45 bg-foreground/[0.03] px-2.5 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{error.description}</p>
                                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  code {error.code}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className="rounded-sm bg-foreground/8 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                                  {formatCountLabel(error.count, 'error')}
                                </span>
                                <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                                  {formatCountLabel(error.objectCount, 'object')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2.5 rounded-sm border border-border/45 bg-foreground/[0.03] px-2.5 py-2 text-sm text-muted-foreground">
                          No validation errors.
                        </p>
                      )}
                    </section>
                  </>
                )}
              </TabsContent>
            )}
          </div>
        </div>
      </Tabs>
    </DialogContent>
  )
}

export function Val3dityParametersDialog({
  parameters,
  onChange,
  onRun,
}: {
  parameters: Val3dityParameterForm
  onChange: (parameters: Val3dityParameterForm) => void
  onRun: () => void
}) {
  const hasInvalidNumber =
    !isValidVal3dityParameterValue(parameters.tolSnap, 0) ||
    !isValidVal3dityParameterValue(parameters.planarityD2pTol, 0) ||
    !isValidVal3dityParameterValue(parameters.planarityNTol, 0) ||
    !isValidVal3dityParameterValue(parameters.overlapTol, -Infinity)

  const updateDraft = (key: keyof Val3dityParameterForm, value: string) => {
    onChange({ ...parameters, [key]: value })
  }

  return (
    <DialogContent closeLabel="Close val3dity parameters" className="p-0">
      <DialogHeader className="border-b border-border/40 p-5 pr-14">
        <DialogTitle className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
          Run val3dity (experimental)
        </DialogTitle>
        <DialogDescription>
          Configure the validation, then run it against the current dataset. Be aware this is an experimental feature and it can give wrong results.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4 p-5">
        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          <Val3dityNumberInput
            id="val3dity-tol-snap"
            label="Snap tolerance"
            min="0"
            step="0.001"
            value={parameters.tolSnap}
            invalid={!isValidVal3dityParameterValue(parameters.tolSnap, 0)}
            onChange={(value) => updateDraft('tolSnap', value)}
          />
          <Val3dityNumberInput
            id="val3dity-overlap-tol"
            label="Overlap tolerance"
            step="0.1"
            value={parameters.overlapTol}
            invalid={!isValidVal3dityParameterValue(parameters.overlapTol, -Infinity)}
            onChange={(value) => updateDraft('overlapTol', value)}
          />
          <Val3dityNumberInput
            id="val3dity-planarity-d2p-tol"
            label="Planarity distance"
            min="0"
            step="0.01"
            value={parameters.planarityD2pTol}
            invalid={!isValidVal3dityParameterValue(parameters.planarityD2pTol, 0)}
            onChange={(value) => updateDraft('planarityD2pTol', value)}
          />
          <Val3dityNumberInput
            id="val3dity-planarity-n-tol"
            label="Planarity normal"
            min="0"
            step="0.1"
            value={parameters.planarityNTol}
            invalid={!isValidVal3dityParameterValue(parameters.planarityNTol, 0)}
            onChange={(value) => updateDraft('planarityNTol', value)}
          />
        </FieldGroup>

        <Field>
          <FieldLabel htmlFor="val3dity-primitive" className="text-xs text-muted-foreground">
            Primitive
          </FieldLabel>
          <NativeSelect
            id="val3dity-primitive"
            className="w-full"
            value={parameters.primitive}
            onChange={(event) =>
              onChange({
                ...parameters,
                primitive: event.target.value as Val3dityPrimitiveOption,
              })}
          >
            <NativeSelectOption value="auto">Auto</NativeSelectOption>
            <NativeSelectOption value="Solid">Solid</NativeSelectOption>
            <NativeSelectOption value="MultiSurface">MultiSurface</NativeSelectOption>
            <NativeSelectOption value="CompositeSurface">CompositeSurface</NativeSelectOption>
          </NativeSelect>
        </Field>

        {hasInvalidNumber && (
          <FieldError className="rounded-sm border border-destructive/25 bg-destructive/8 px-3 py-2">
            Snap and planarity tolerances must be non-negative numbers; overlap tolerance must be numeric.
          </FieldError>
        )}
      </FieldGroup>

      <div className="flex items-center justify-between border-t border-border/40 p-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(DEFAULT_VAL3DITY_PARAMETERS)}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={onRun}
          disabled={hasInvalidNumber}
        >
          Run
        </Button>
      </div>
    </DialogContent>
  )
}

export function Val3dityNumberInput({
  id,
  label,
  min,
  step,
  value,
  invalid,
  onChange,
}: {
  id: string
  label: string
  min?: string
  step: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  return (
    <Field data-invalid={invalid} className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

export function ChangelogDialogContent({
  changelog,
}: {
  changelog: string
}) {
  const sections = parseChangelog(changelog)

  return (
    <DialogContent
      closeLabel="Close changelog"
      className="flex min-h-0 max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden p-0"
    >
      <DialogDescription className="sr-only">
        Release notes for CJLoupe version {APP_VERSION}.
      </DialogDescription>
      <div className="flex items-start gap-4 border-b border-border/40 p-5 pr-14">
        <div className="min-w-0">
          <DialogTitle className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            Changelog
          </DialogTitle>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm text-muted-foreground">CJLoupe</p>
            <span className="text-sm font-bold text-foreground">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-sm font-semibold text-foreground">{section.heading}</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-6 text-foreground/82">
                {section.items.map((item, index) => (
                  <li key={`${section.heading}:${index}`} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </DialogContent>
  )
}

export function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="rounded-sm border border-border/45 bg-foreground/[0.03] px-2.5 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 break-words text-sm leading-5 text-foreground',
          mono && 'font-mono text-[12px]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export function MetadataValue({
  metadataKey,
  value,
}: {
  metadataKey?: string
  value: unknown
}): ReactNode {
  if (value == null) {
    return <span className="text-muted-foreground">—</span>
  }

  if (typeof value === 'number') {
    return <span className="font-mono text-[12px]">{String(value)}</span>
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'true' : 'false'}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground">—</span>
    }

    if (isGeographicalExtentKey(metadataKey) && isNumberArray(value) && value.length >= 6) {
      return (
        <ExtentCoordinates min={value.slice(0, 3)} max={value.slice(3, 6)} />
      )
    }

    const allPrimitive = value.every(
      (entry) =>
        entry == null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean',
    )

    if (allPrimitive) {
      const isContinuousArray = isNumberArray(value)
      const rendered = value.map((entry) => formatMetadataPrimitive(entry)).join(', ')
      return <span className={isContinuousArray ? 'font-mono text-[12px]' : undefined}>{rendered}</span>
    }

    return (
      <div className="flex flex-col gap-2">
        {value.map((entry, index) => (
          <div key={index} className="rounded-sm border border-border/45 bg-background/60 px-2.5 py-2">
            <MetadataValue value={entry} />
          </div>
        ))}
      </div>
    )
  }

  if (typeof value === 'object') {
    return (
      <dl className="mt-1 flex flex-col gap-2 border-l border-border/45 pl-3">
        {Object.entries(value as Record<string, unknown>)
          .filter(([, nested]) => !isEmptyMetadataValue(nested))
          .map(([nestedKey, nestedValue]) => (
            <div key={nestedKey}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {formatMetadataKey(nestedKey)}
              </dt>
              <dd className="mt-0.5 break-words text-foreground">
                <MetadataValue metadataKey={nestedKey} value={nestedValue} />
              </dd>
            </div>
          ))}
      </dl>
    )
  }

  return String(value)
}

export function ExtentCoordinates({
  min,
  max,
}: {
  min: number[]
  max: number[]
}) {
  const dimensions = min.map((entry, index) => (max[index] ?? entry) - entry)
  const rows = [
    { label: 'min', values: min, formatValue: String },
    { label: 'max', values: max, formatValue: String },
    { label: 'dim', values: dimensions, formatValue: formatDimensionValue },
  ]

  return (
    <div className="max-w-full overflow-x-auto">
      <div className="grid w-max grid-cols-[2.5rem_repeat(3,max-content)] gap-x-2 gap-y-0.5 font-mono text-[12px]">
        {rows.map((row) => (
          <span key={row.label} className="contents">
            <span aria-hidden="true" className="select-none text-muted-foreground">
              {row.label}:
            </span>
            {row.values.map((entry, index) => (
              <span key={index}>
                {row.formatValue(entry)}
                {index < row.values.length - 1 ? ',' : ''}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

