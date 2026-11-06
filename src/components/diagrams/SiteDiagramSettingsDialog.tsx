import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import EndUserLogoSection from "@/components/diagrams/EndUserLogoSection";
import SymbolChoicesEditor from "@/components/diagrams/SymbolChoicesEditor";
import VoltageColorsEditor from "@/components/diagrams/VoltageColorsEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
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
  fetchCustomSymbols,
  fetchSymbolChoices,
  fetchVoltageColors,
  saveSymbolChoices,
  saveVoltageColors,
} from "@/services/siteDiagramsService";

interface SiteDiagramSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  userId: string | null;
}

/** Settings that apply to every diagram at one site. */
export default function SiteDiagramSettingsDialog({
  open,
  onClose,
  siteId,
  siteName,
  userId,
}: SiteDiagramSettingsDialogProps) {
  const [colors, setColors] = useState<VoltageColors | null>(null);
  const [defaults, setDefaults] = useState<VoltageColors>(BUILT_IN_VOLTAGE_COLORS);
  const [showDefaultsLink, setShowDefaultsLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState<CustomSymbolRow[]>([]);
  const [choices, setChoices] = useState<SymbolChoices>({});
  const [defaultChoices, setDefaultChoices] = useState<SymbolChoices>({});
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setColors(null);

    Promise.all([
      fetchVoltageColors(siteId),
      fetchVoltageColors(null),
      canEditDiagramDefaults(),
      fetchCustomSymbols(),
      fetchSymbolChoices(siteId),
      fetchSymbolChoices(null),
      fetchEquipmentTypes(),
    ])
      .then(([site, standard, canEditDefaults, symbols, siteChoices, standardChoices, types]) => {
        if (cancelled) return;
        setActiveSymbols(symbols.map(toGeometry), {});
        setLibrary(symbols);
        setChoices(cleanSymbolChoices(siteChoices));
        setDefaultChoices(cleanSymbolChoices(standardChoices));
        setEquipmentTypes(types);
        const defaultColors = cleanVoltageColors(standard);
        setDefaults(defaultColors);
        // A site with no diagrams yet hasn't copied the default, so it shows what it would get.
        setColors(site ? cleanVoltageColors(site) : defaultColors);
        setShowDefaultsLink(canEditDefaults);
      })
      .catch((error) => {
        console.error("Failed to load voltage colors:", error);
        if (!cancelled) {
          toast.error("Voltage colors couldn't be loaded.");
          onClose();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, siteId, onClose]);

  const save = async (next: VoltageColors) => {
    setSaving(true);
    try {
      await saveVoltageColors(siteId, next, userId);
      setColors(next);
      toast.success("Voltage colors saved.");
    } catch (error) {
      console.error("Failed to save voltage colors:", error);
      toast.error("Voltage colors couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveChoices = async (next: SymbolChoices) => {
    setSaving(true);
    try {
      await saveSymbolChoices(siteId, next, userId);
      setChoices(next);
      toast.success("Symbols saved.");
    } catch (error) {
      console.error("Failed to save symbols:", error);
      toast.error("Symbols couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="left-1/2 top-1/2 max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diagram settings</DialogTitle>
          <DialogDescription>
            Printing, symbols and voltage colors for every diagram at {siteName}.
          </DialogDescription>
        </DialogHeader>

        {colors ? (
          <>
            <EndUserLogoSection siteId={siteId} userId={userId} />
            <section>
              <h3 className="mb-2 text-sm font-semibold">Symbols</h3>
              <SymbolChoicesEditor
                choices={choices}
                library={library}
                equipmentTypes={equipmentTypes}
                resetTo={defaultChoices}
                resetLabel="Use default symbols"
                saving={saving}
                onSave={(next) => void saveChoices(next)}
              />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Voltage colors</h3>
              <VoltageColorsEditor
                colors={colors}
                resetTo={defaults}
                resetLabel="Use default colors"
                saving={saving}
                onSave={(next) => void save(next)}
              />
            </section>
          </>
        ) : (
          <LoadingSpinner />
        )}

        {showDefaultsLink && (
          <Link to="/diagram-defaults" className="text-sm text-brand hover:underline">
            Change the defaults for new sites
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
