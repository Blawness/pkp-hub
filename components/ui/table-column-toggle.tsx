"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "./button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "./dropdown-menu"

type Column = {
  id: string
  label: string
  visible: boolean
}

/**
 * Column visibility toggle for data tables.
 * Shows dropdown with checkboxes to show/hide columns.
 * Persists to localStorage.
 */
export function TableColumnToggle({
  columns,
  onChange,
  storageKey = "table-columns",
}: {
  columns: Column[]
  onChange: (columns: Column[]) => void
  storageKey?: string
}) {
  const [cols, setCols] = useState(columns)

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return

    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Column[]
        setCols(parsed)
        onChange(parsed)
      } catch {
        // Ignore parse errors
      }
    }
  }, [storageKey, onChange])

  const handleToggle = (id: string) => {
    const updated = cols.map((c) =>
      c.id === id ? { ...c, visible: !c.visible } : c
    )
    setCols(updated)
    onChange(updated)

    // Persist to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(updated))
    }
  }

  const visibleCount = cols.filter((c) => c.visible).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="outline"
          size="sm"
          aria-label="Toggle columns"
          title={`${visibleCount} columns shown`}
          className="gap-2"
        >
          <EyeIcon className="size-4" />
          <span className="hidden sm:inline">Kolom</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-semibold">
          Tampilkan kolom
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {cols.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={col.visible}
            onCheckedChange={() => handleToggle(col.id)}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2 flex-1">
              {col.visible ? (
                <EyeIcon className="size-3.5" />
              ) : (
                <EyeOffIcon className="size-3.5 opacity-50" />
              )}
              <span className="text-sm">{col.label}</span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
