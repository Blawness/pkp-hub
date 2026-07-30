# UI/UX Components Implementation Guide

**Status:** ✅ Components created and ready to integrate  
**Date:** January 30, 2025

---

## ✅ Components Created

### 1. **StatusBadge** (Enhanced Existing)
**File:** `components/projects/status-badge.tsx` (UPDATED)

**Features:**
- Icon + label display for all project statuses
- Three variants: `default`, `compact`, `text-only`
- Automatically uses correct colors from `toneFor(status)`
- Icons: 📋 (Baru), 📅 (Dijadwalkan), 📊 (Data Diambil), ⚙️ (Diproses), ✓ (Selesai), ✕ (Dibatalkan)

**Usage:**
```tsx
import { StatusBadge, StatusDot } from "@/components/projects/status-badge"

// Full badge with icon + label
<StatusBadge status="diproses" />

// Compact icon-only
<StatusBadge status="diproses" variant="compact" />

// Text only
<StatusBadge status="diproses" variant="text-only" />

// Just a dot
<StatusDot status="diproses" />
```

**Already Updated in:**
- ✅ `components/projects/projects-columns.tsx` (table status column)
- ✅ `components/dashboard/status-pipeline.tsx` (pipeline segment icons)

---

### 2. **PhaseCard** (New Component)
**File:** `components/projects/phase-card.tsx` (NEW)

**Features:**
- Beautiful card layout for project phases
- Displays: name, status, weight, target date, surveyor
- Shows overdue/due-today indicators with red/amber backgrounds
- Progress percentage (weight/total)
- Action buttons: Mulai, Selesaikan, Edit
- Dropdown menu for additional actions
- Fully editable with callbacks

**Usage:**
```tsx
import { PhaseCard } from "@/components/projects/phase-card"

<PhaseCard
  phase={phase}
  totalWeight={10}
  isEditable={true}
  onStatusChange={(id, status) => updatePhaseStatus(id, status)}
  onEdit={(id) => openEditDialog(id)}
  onDelete={(id) => confirmAndDelete(id)}
/>
```

**TODO: Integrate into:**
- [ ] `/app/dashboard/projects/[id]/page.tsx` (replace phase list)

---

### 3. **ProjectProgress** (New Component)
**File:** `components/projects/project-progress.tsx` (NEW)

**Features:**
- Calculate progress from phases (sum of completed weights / total weights)
- Visual progress bar with percentage
- Handles empty phase list gracefully
- Accessible with ARIA attributes

**Usage:**
```tsx
import { ProjectProgress, calculateProgress, PhasesEmpty } from "@/components/projects/project-progress"

const progress = calculateProgress(phases)

<ProjectProgress progress={progress} />

{phases.length === 0 && <PhasesEmpty />}
```

**TODO: Integrate into:**
- [ ] `/app/dashboard/projects/[id]/page.tsx` (above phase cards)

---

### 4. **LoadingContainer** (New Component)
**File:** `components/ui/loading-container.tsx` (NEW)

**Features:**
- Consistent loading skeleton display
- Three types: `table` (multi-row), `list` (stacked), `card` (single)
- Automatically shows/hides based on `isLoading` prop
- Customizable rows and columns

**Usage:**
```tsx
import { LoadingContainer } from "@/components/ui/loading-container"

<LoadingContainer isLoading={isLoading} type="table" rows={5} columns={4}>
  <ProjectsTable {...props} />
</LoadingContainer>
```

**TODO: Integrate into:**
- [ ] `/app/dashboard/projects/page.tsx`
- [ ] `/app/dashboard/clients/page.tsx`
- [ ] `/app/dashboard/documents/page.tsx`
- [ ] `/app/dashboard/equipment/page.tsx`

---

### 5. **FieldTooltip** (New Component)
**File:** `components/ui/field-tooltip.tsx` (NEW)

**Features:**
- Help icon next to field labels
- Hover to show tooltip
- Marks required fields with red asterisk
- Accessible (sr-only text, proper ARIA)

**Usage:**
```tsx
import { FormFieldWithTooltip } from "@/components/ui/field-tooltip"

<FormFieldWithTooltip
  label="Bobot Fase"
  tooltip="Ditentukan sebagai % dari total progres. Fase dengan bobot 50 = 50% done ketika selesai."
  required
>
  <Input type="number" {...register("weight")} />
</FormFieldWithTooltip>
```

**TODO: Integrate into:**
- [ ] Phase edit form (`components/projects/phase-form-dialog.tsx`)
- [ ] Project form
- [ ] Equipment form

---

### 6. **TableColumnToggle** (New Component)
**File:** `components/ui/table-column-toggle.tsx` (NEW)

**Features:**
- Dropdown menu to show/hide columns
- Persists to localStorage
- Counts visible columns
- Eye icon indicates visibility state

**Usage:**
```tsx
import { TableColumnToggle } from "@/components/ui/table-column-toggle"

const [visibleColumns, setVisibleColumns] = useState([
  { id: "title", label: "Judul", visible: true },
  { id: "status", label: "Status", visible: true },
  { id: "value", label: "Nilai", visible: false },
])

<TableColumnToggle
  columns={visibleColumns}
  onChange={setVisibleColumns}
  storageKey="projects-table-columns"
/>

// Render only visible columns in your table
```

**TODO: Integrate into:**
- [ ] Projects table toolbar
- [ ] Documents table toolbar
- [ ] Equipment table toolbar

---

### 7. **StatusLegend** (New Component)
**File:** `components/ui/status-legend.tsx` (NEW)

**Features:**
- Card showing all status icons + labels
- Helps users understand status pipeline
- Can be added to dashboard or as help panel

**Usage:**
```tsx
import { StatusLegend } from "@/components/ui/status-legend"

<div className="grid gap-6 md:grid-cols-3">
  {/* dashboard cards */}
  <StatusLegend />
</div>
```

**TODO: Integrate into:**
- [ ] Dashboard (optional, nice-to-have)
- [ ] Projects page help panel

---

---

## 🚀 Integration Roadmap

### Phase 1: Low-Hanging Fruit (Already Done)
- ✅ StatusBadge with icons
- ✅ Status pipeline with icons

### Phase 2: Phase Timeline (Today/Tomorrow)
- [ ] Integrate PhaseCard into project detail page
- [ ] Add ProjectProgress above phases
- [ ] Test on mobile

### Phase 3: Loading States (Tomorrow)
- [ ] Wrap all data pages with LoadingContainer
- [ ] Test skeleton loading on filter changes

### Phase 4: Forms & Fields (This Week)
- [ ] Add FieldTooltip to phase form
- [ ] Add tooltips to other important forms

### Phase 5: Power User Features (Next Week)
- [ ] Integrate TableColumnToggle into project table
- [ ] Integrate into documents table
- [ ] Add StatusLegend to dashboard

---

## 📋 Step-by-Step Integration

### Step 1: View Phase Card (30 min)
1. Open `/app/dashboard/projects/[id]/page.tsx`
2. Find the phases section
3. Replace current phase list/display with:

```tsx
import { PhaseCard } from "@/components/projects/phase-card"
import { ProjectProgress, calculateProgress, PhasesEmpty } from "@/components/projects/project-progress"

// In your page component:
const progress = calculateProgress(phases)

return (
  <div className="space-y-6">
    {/* ... other content ... */}
    
    <div className="space-y-4">
      {phases.length > 0 ? (
        <>
          <ProjectProgress progress={progress} />
          <div className="space-y-3">
            {phases.map(phase => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                totalWeight={totalWeight}
                isEditable={can(ctx, "project.update")}
                onStatusChange={handlePhaseStatusChange}
                onEdit={() => openPhaseEditModal(phase.id)}
                onDelete={() => confirmAndDeletePhase(phase.id)}
              />
            ))}
          </div>
        </>
      ) : (
        <PhasesEmpty />
      )}
    </div>
  </div>
)
```

### Step 2: Add Loading States (1 hour)
1. Open `/app/dashboard/projects/page.tsx`
2. Import `LoadingContainer`
3. Wrap table with loading state:

```tsx
import { LoadingContainer } from "@/components/ui/loading-container"

<LoadingContainer isLoading={isLoading} type="table">
  <ProjectsTable {...props} />
</LoadingContainer>
```

Repeat for other data-heavy pages (clients, documents, equipment).

### Step 3: Add Tooltips (1 hour)
1. Open phase form component
2. Import `FormFieldWithTooltip`
3. Wrap form fields:

```tsx
import { FormFieldWithTooltip } from "@/components/ui/field-tooltip"

<FormFieldWithTooltip
  label="Bobot"
  tooltip="Persentase kontribusi fase terhadap progres total proyek."
  required
>
  <Input type="number" {...register("weight")} />
</FormFieldWithTooltip>
```

### Step 4: Add Column Toggle (1 hour)
1. Open projects table component
2. Import `TableColumnToggle`
3. Add state and dropdown:

```tsx
import { TableColumnToggle } from "@/components/ui/table-column-toggle"

const [visibleColumns, setVisibleColumns] = useState([
  { id: "title", label: "Judul", visible: true },
  { id: "status", label: "Status", visible: true },
  { id: "client", label: "Klien", visible: true },
  { id: "value", label: "Nilai", visible: false },
])

<div className="flex justify-between items-center mb-4">
  <div>{/* filters */}</div>
  <TableColumnToggle
    columns={visibleColumns}
    onChange={setVisibleColumns}
  />
</div>
```

### Step 5: Add Status Legend (15 min)
1. Open dashboard page
2. Import `StatusLegend`
3. Add to grid:

```tsx
import { StatusLegend } from "@/components/ui/status-legend"

<div className="grid gap-6 md:grid-cols-3">
  {/* stat cards */}
  <StatusLegend />
</div>
```

---

## 🧪 Testing Checklist

After integration, test each component:

- [ ] **StatusBadge**
  - [ ] All 6 statuses display with correct icons + colors
  - [ ] Works on mobile (compact variant)
  - [ ] Accessible (ARIA labels, readable by screen reader)

- [ ] **PhaseCard**
  - [ ] Shows all phase info (name, status, weight, date, surveyor)
  - [ ] Overdue dates show red with "Telat X hari"
  - [ ] Action buttons work (Mulai, Selesaikan, Edit)
  - [ ] Mobile: cards stack, buttons are tap-friendly (48px+)

- [ ] **ProjectProgress**
  - [ ] Calculates correct percentage
  - [ ] Progress bar animates smoothly
  - [ ] Empty state shows when no phases

- [ ] **LoadingContainer**
  - [ ] Shows skeleton while loading
  - [ ] Fades in content when done
  - [ ] No console errors

- [ ] **FieldTooltip**
  - [ ] Help icon appears next to labels
  - [ ] Tooltip shows on hover
  - [ ] Required asterisk shows when `required={true}`

- [ ] **TableColumnToggle**
  - [ ] Dropdown opens with all columns
  - [ ] Clicking checkbox toggles column visibility
  - [ ] Preference persists on page reload
  - [ ] Count shows in button

- [ ] **StatusLegend**
  - [ ] All statuses displayed with icons
  - [ ] Renders correctly on desktop + mobile
  - [ ] Part of card layout

---

## 🔧 Troubleshooting

**Issue:** `StatusBadge` not showing icons
→ Check that `lucide-react` is imported and icons are in `statusIcons` map

**Issue:** `PhaseCard` dates are wrong
→ Make sure `targetDate` is in `YYYY-MM-DD` format (string)

**Issue:** `LoadingContainer` doesn't show skeleton
→ Verify `isLoading` prop is `true` and import `TableSkeleton` works

**Issue:** `FieldTooltip` tooltip doesn't appear
→ Check that `Tooltip` component from `shadcn/ui` is installed

**Issue:** `TableColumnToggle` doesn't persist
→ Verify localStorage is available (not in iframe or SSR context)

---

## 📊 Files Modified/Created Summary

**Created:**
- ✨ `components/projects/phase-card.tsx` (NEW)
- ✨ `components/projects/project-progress.tsx` (NEW)
- ✨ `components/ui/loading-container.tsx` (NEW)
- ✨ `components/ui/field-tooltip.tsx` (NEW)
- ✨ `components/ui/table-column-toggle.tsx` (NEW)
- ✨ `components/ui/status-legend.tsx` (NEW)

**Modified:**
- ✏️ `components/projects/status-badge.tsx` (added icons + variants)
- ✏️ `components/dashboard/status-pipeline.tsx` (added icons)
- ✏️ `components/projects/projects-columns.tsx` (uses updated StatusBadge)

**No changes needed:**
- `components/ui/confirm-dialog.tsx` (already enhanced)
- `lib/status-color.ts` (perfect as is)
- `lib/labels.ts` (perfect as is)

---

## 📈 Next Steps

1. **Today:**
   - [ ] Review this guide
   - [ ] Start Phase 2 integration (PhaseCard into project detail)
   - [ ] Test PhaseCard on mobile

2. **Tomorrow:**
   - [ ] Complete Phase 3 (LoadingContainer on all pages)
   - [ ] Start Phase 4 (FieldTooltip on forms)

3. **This Week:**
   - [ ] Complete Phase 5 (TableColumnToggle, StatusLegend)
   - [ ] Accessibility audit (keyboard nav, screen reader)
   - [ ] User testing with 2-3 team members

4. **Next Week:**
   - [ ] Start building features (payment ledger, notifications, etc.)
   - [ ] Create DESIGN_SYSTEM.md documentation
   - [ ] Consider Storybook setup

---

## 💡 Pro Tips

1. **Test on mobile first:** Always check components at 375px width
2. **Keyboard only:** Close trackpad and test Tab/Enter navigation
3. **Ask for feedback:** Show phase cards to surveyors before shipping
4. **Measure impact:** Track "time to update project status" before/after
5. **One component at a time:** Ship StatusBadge, get feedback, then PhaseCard

---

**Questions?** Refer back to `/suggest-reports/COMPONENT_IMPROVEMENTS.md` for detailed code examples.

Good luck! 🚀
