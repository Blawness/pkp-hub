import { HelpCircleIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"

/**
 * Field with inline help tooltip.
 * Shows help icon next to label; hover reveals explanation.
 *
 * `htmlFor` (opsional) mengasosiasikan `<label>` dengan input lewat DOM,
 * supaya klik label memfokuskan input dan screen reader mengumumkan
 * hubungan itu. Pemanggil meneruskan `id` miliknya sendiri (yang sudah
 * ada di `<Input id="…">` dan semacamnya) — komponen ini tidak memaksakan
 * id baru, supaya tidak ada dua `id` identik di halaman yang sama.
 */
export function FormFieldWithTooltip({
  label,
  tooltip,
  children,
  required,
  htmlFor,
}: {
  label: string
  tooltip?: string
  children: React.ReactNode
  required?: boolean
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2" htmlFor={htmlFor}>
        <span className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive">*</span>}
        </span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={`Bantuan untuk ${label}`}
                >
                  <HelpCircleIcon className="size-4" />
                  <span className="sr-only">More information</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </label>
      {children}
    </div>
  )
}
