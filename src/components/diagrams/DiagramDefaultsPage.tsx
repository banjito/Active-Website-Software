import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import type { NewCustomSymbol } from "@/components/diagrams/CustomSymbolDialog";
import SymbolChoicesEditor from "@/components/diagrams/SymbolChoicesEditor";
import SymbolLibrarySection from "@/components/diagrams/SymbolLibrarySection";
import VoltageColorsEditor from "@/components/diagrams/VoltageColorsEditor";
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/lib/AuthContext";
import {
  cleanSymbolChoices,
  toGeometry,
  type CustomSymbolRow,
  type SymbolChoices,
} from "@/lib/diagrams/customSymbols";
import { setActiveSymbols } from "@/lib/diagrams/symbols";
import { BUILT_IN_VOLTAGE_COLORS, cleanVoltageColors, type VoltageColors } from "@/lib/diagrams/voltage";
import { fetchEquipmentTypes } from "@/services/equipmentAssetsService";
import {
  canEditDiagramDefaults,
  createCustomSymbol,
  deleteCustomSymbol,
  fetchCustomSymbols,
  fetchSymbolChoices,
  fetchVoltageColors,
  saveSymbolChoices,
  saveVoltageColors,
  updateCustomSymbol,
} from "@/services/siteDiagramsService";

/** Admins and report reviewers set what new sites start with. Existing sites keep their own. */
export default function DiagramDefaultsPage() {
  const { user } = useAuth();
  /** undefined while loading. */
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);
  const [colors, setColors] = useState<VoltageColors>(BUILT_IN_VOLTAGE_COLORS);
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState<CustomSymbolRow[]>([]);
  const [choices, setChoices] = useState<SymbolChoices>({});
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);

  const applyLibrary = (next: CustomSymbolRow[]) => {
    setActiveSymbols(next.map(toGeometry), {});
    setLibrary(next);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      canEditDiagramDefaults(),
      fetchVoltageColors(null),
      fetchCustomSymbols(),
      fetchSymbolChoices(null),
      fetchEquipmentTypes(),
    ])
      .then(([canEdit, saved, symbols, savedChoices, types]) => {
        if (cancelled) return;
        applyLibrary(symbols);
        setChoices(cleanSymbolChoices(savedChoices));
        setEquipmentTypes(types);
        setAllowed(canEdit);
        setColors(cleanVoltageColors(saved));
      })
      .catch((error) => {
        console.error("Failed to load diagram defaults:", error);
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: VoltageColors) => {
    setSaving(true);
    try {
      await saveVoltageColors(null, next, user?.id ?? null);
      setColors(next);
      toast.success("Default colors saved.");
    } catch (error) {
      console.error("Failed to save default colors:", error);
      toast.error("Default colors couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveChoices = async (next: SymbolChoices) => {
    setSaving(true);
    try {
      await saveSymbolChoices(null, next, user?.id ?? null);
      setChoices(next);
      toast.success("Default symbols saved.");
    } catch (error) {
      console.error("Failed to save default symbols:", error);
      toast.error("Default symbols couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  const addSymbol = async (symbol: NewCustomSymbol) => {
    const created = await createCustomSymbol(symbol, user?.id ?? null);
    applyLibrary([...library, created]);
  };

  const changeSymbol = async (symbolId: string, symbol: NewCustomSymbol) => {
    const updated = await updateCustomSymbol(symbolId, symbol);
    applyLibrary(library.map((row) => (row.id === symbolId ? updated : row)));
  };

  const removeSymbol = async (symbol: CustomSymbolRow) => {
    await deleteCustomSymbol(symbol.id);
    applyLibrary(
      library.map((row) =>
        row.id === symbol.id ? { ...row, deleted_at: new Date().toISOString() } : row,
      ),
    );
  };

  if (allowed === undefined) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <p className="p-6 text-neutral-600 dark:text-neutral-300">
        Only admins and report reviewers can change diagram defaults.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Symbol library</CardTitle>
          <CardDescription>
            Uploaded and drawn symbols. Every site can pick from these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SymbolLibrarySection
            library={library}
            onCreate={addSymbol}
            onUpdate={changeSymbol}
            onDelete={removeSymbol}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default symbols</CardTitle>
          <CardDescription>
            What new sites start with. Existing sites and their diagrams aren't changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SymbolChoicesEditor
            choices={choices}
            library={library}
            equipmentTypes={equipmentTypes}
            resetTo={{}}
            resetLabel="Use built-in symbols"
            saving={saving}
            onSave={(next) => void saveChoices(next)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default voltage colors</CardTitle>
          <CardDescription>
            A site copies these when its first diagram is created. Sites that already have diagrams
            keep their own colors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoltageColorsEditor
            colors={colors}
            resetTo={BUILT_IN_VOLTAGE_COLORS}
            resetLabel="Use built-in colors"
            saving={saving}
            onSave={(next) => void save(next)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
