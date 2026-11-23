import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { PersonRow } from "@/services/rolesAdminService";
import PersonAccessPanel from "./PersonAccessPanel";
import PersonAccountPanel from "./PersonAccountPanel";

interface Props {
  person: PersonRow | null;
  onClose: () => void;
  /** "Invite and remove people": the Account tab. */
  canUsers: boolean;
  /** "Change roles and permissions": the Permissions tab. */
  canRoles: boolean;
  currentUserId: string | null;
  onPatch: (id: string, patch: Partial<PersonRow>) => void;
  onRolePicked: (id: string, role: string | null) => void;
  onChanged: () => void;
}

/** Everything about one person in one window. */
export default function PersonDialog({
  person,
  onClose,
  canUsers,
  canRoles,
  currentUserId,
  onPatch,
  onRolePicked,
  onChanged,
}: Props) {
  return (
    <Dialog open={!!person} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-3xl">
        {person && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle>{person.name}</DialogTitle>
              <DialogDescription>
                {person.email}
                {!person.is_active && " · switched off"}
              </DialogDescription>
            </DialogHeader>
            <Tabs key={person.id} defaultValue={canUsers ? "account" : "permissions"}>
              <TabsList>
                {canUsers && <TabsTrigger value="account">Account</TabsTrigger>}
                {canRoles && <TabsTrigger value="permissions">Permissions</TabsTrigger>}
              </TabsList>
              {canUsers && (
                <TabsContent value="account" className="pt-4">
                  <PersonAccountPanel person={person} onPatch={(patch) => onPatch(person.id, patch)} />
                </TabsContent>
              )}
              {canRoles && (
                <TabsContent value="permissions" className="pt-4">
                  <PersonAccessPanel
                    userId={person.id}
                    todayRole={person.today_role}
                    currentUserId={currentUserId}
                    onRoleChanged={(role) => onRolePicked(person.id, role)}
                    onChanged={onChanged}
                  />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
