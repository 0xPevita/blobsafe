import { useEffect, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { AlertCircle, Copy, Loader2, Plus, RefreshCw, Trash2, UsersRound } from "lucide-react";
import {
  IS_ACCESS_CONTROL_CONFIGURED,
  deleteTeamOnChain,
  getOnChainTeamsForOwner,
  upsertTeamOnChain,
  type OnChainTeamView,
} from "@/lib/accessControl";
import {
  createTeam,
  isValidAptosAddress,
  parseTeamMembers,
  readTeams,
  removeTeam,
  saveTeam,
  type TeamProfile,
} from "@/lib/teams";
import { getWalletAccountAddress, truncateAddress } from "@/lib/shelby";

export function TeamAccess() {
  const { connected, account, signAndSubmitTransaction } = useWallet();
  const accountAddress = getWalletAccountAddress(account);
  const [teams, setTeams] = useState<TeamProfile[]>(() => accountAddress ? readTeams(accountAddress) : []);
  const [name, setName] = useState("");
  const [membersText, setMembersText] = useState("");
  const [error, setError] = useState("");
  const [chainStatus, setChainStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);

  const refresh = async () => {
    if (!accountAddress) {
      setTeams([]);
      return;
    }

    setLoading(true);
    setChainStatus("");

    try {
      if (IS_ACCESS_CONTROL_CONFIGURED) {
        const onChainTeams = await getOnChainTeamsForOwner(accountAddress);
        const mapped = onChainTeams.map(onChainTeamToProfile);
        mapped.forEach((team) => saveTeam(team, accountAddress));
        setTeams(mergeTeams(mapped, readTeams(accountAddress)));
        setChainStatus("Recipient groups synced from the access registry.");
      } else {
        setTeams(readTeams(accountAddress));
        setChainStatus("Access registry needs setup. Recipient groups are local only.");
      }
    } catch (err) {
      setTeams(readTeams(accountAddress));
      setChainStatus(err instanceof Error
        ? `Could not sync on-chain groups. Showing local cache. ${err.message}`
        : "Could not sync on-chain groups. Showing local cache.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    setError("");
    setCopiedTeamId(null);
  }, [accountAddress]);

  const handleCreate = async () => {
    setError("");

    try {
      if (!connected || !accountAddress) {
        throw new Error("Connect the owner wallet before creating a recipient group.");
      }

      const teamName = name.trim();
      if (!teamName) throw new Error("Group name is required.");

      const members = parseTeamMembers(membersText);
      if (members.length === 0) throw new Error("Add at least one recipient wallet address.");

      const invalid = members.find((member) => !isValidAptosAddress(member.address));
      if (invalid) throw new Error(`Invalid Aptos address: ${invalid.address}`);

      const team = createTeam({ name: teamName, members });
      setLoading(true);

      if (IS_ACCESS_CONTROL_CONFIGURED) {
        if (!signAndSubmitTransaction) throw new Error("Connected wallet cannot submit transactions.");
        const txHash = await upsertTeamOnChain({
          signAndSubmitTransaction,
          teamId: team.id,
          name: team.name,
          memberAddresses: team.members.map((member) => member.address),
          memberLabels: team.members.map((member) => member.label ?? ""),
          memberRoles: team.members.map((member) => member.role),
        });
        team.chain = {
          status: "registered",
          txHash,
        };
      } else {
        team.chain = { status: "local" };
      }

      saveTeam(team, accountAddress);
      setName("");
      setMembersText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recipient group could not be created.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (team: TeamProfile) => {
    if (!accountAddress) return;
    setError("");
    setDeletingTeamId(team.id);

    try {
      if (IS_ACCESS_CONTROL_CONFIGURED) {
        if (!signAndSubmitTransaction) throw new Error("Connected wallet cannot submit transactions.");
        await deleteTeamOnChain({
          signAndSubmitTransaction,
          teamId: team.id,
        });
      }
      removeTeam(team.id, accountAddress);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recipient group could not be deleted.");
    } finally {
      setDeletingTeamId(null);
    }
  };

  const copyTeam = async (team: TeamProfile) => {
    const payload = team.members.map((member) => member.address).join("\n");
    await navigator.clipboard.writeText(payload);
    setCopiedTeamId(team.id);
    window.setTimeout(() => setCopiedTeamId(null), 1400);
  };

  return (
    <div className="team-access-page grid gap-5">
      <section className="team-builder-panel premium-surface rounded-2xl p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div>
            <p className="font-display text-base font-semibold text-frost">Recipient groups</p>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-frost-muted">
              Build reusable wallet groups for team sharing. Each member still receives an individual on-chain grant.
            </p>
          </div>
          <span className="accent-chip w-fit rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
            {teams.length} group{teams.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="team-sync-banner mt-4 flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-frost-dim">
            {chainStatus || (IS_ACCESS_CONTROL_CONFIGURED ? "Groups sync with the BlobSafe access registry." : "Access registry needs setup. Groups are local only.")}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <label className="team-field grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">group name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Core contributors"
              className="min-h-11 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
            />
          </label>

          <label className="team-field grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">
              recipient wallets
            </span>
            <span className="text-xs leading-5 text-frost-muted">
              One wallet per line. Add an optional label after the address, for example: <span className="font-mono text-frost">0xabc... alice</span>
            </span>
            <textarea
              value={membersText}
              onChange={(event) => setMembersText(event.target.value)}
              placeholder={"0xabc...\n0xdef... alice"}
              className="team-members-input min-h-[150px] resize-y rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-4 py-3 font-mono text-xs leading-6 text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading || !name.trim() || !membersText.trim()}
              className="premium-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create group
            </button>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <p className="text-xs leading-5">{error}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {loading && teams.length === 0 ? (
        <TeamListSkeleton />
      ) : teams.length === 0 ? (
        <div className="team-empty-state empty-state-premium flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-6 py-12 text-center">
          <div className="empty-state-icon mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
            <UsersRound size={22} />
          </div>
          <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">No recipient groups</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-frost-dim">
            Create a group once, then grant file access to every recipient from the file drawer.
          </p>
        </div>
      ) : (
        <div className="team-groups-grid grid gap-3">
          {teams.map((team) => (
            <section key={team.id} className="team-card premium-surface rounded-2xl p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-xl font-semibold tracking-[-0.02em] text-frost">{team.name}</p>
                    <span className="accent-chip rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                      {team.members.length} members
                    </span>
                    <span className={`team-chain-pill rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                      team.chain?.status === "registered"
                        ? "border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-[var(--acid)]"
                        : "border-[var(--surface-border)] bg-[var(--surface-muted)] text-frost-muted"
                    }`}>
                      {team.chain?.status === "registered" ? "on-chain" : "local"}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-frost-muted">
                    owner {accountAddress ? truncateAddress(accountAddress) : "none"}
                  </p>
                  {team.chain?.txHash && (
                    <p className="mt-1 break-all font-mono text-[11px] text-frost-muted">
                      tx {team.chain.txHash}
                    </p>
                  )}
                </div>
                <div className="team-card-actions flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyTeam(team)}
                    className={`themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] ${copiedTeamId === team.id ? "is-feedback-success" : ""}`}
                  >
                    <Copy size={13} />
                    {copiedTeamId === team.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(team)}
                    disabled={deletingTeamId === team.id}
                    className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-frost-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingTeamId === team.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Delete
                  </button>
                </div>
              </div>

              <div className="team-member-list mt-4 divide-y divide-[var(--surface-border)] rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]">
                {team.members.map((member) => (
                  <div key={member.address} className="team-member-row grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs text-frost">{member.address}</p>
                      {member.label && (
                        <p className="mt-1 text-xs text-frost-muted">{member.label}</p>
                      )}
                    </div>
                    <p className="team-role-pill font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">
                      {member.role}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamListSkeleton() {
  return (
    <div className="premium-surface rounded-2xl p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="skeleton-line h-5 w-48 rounded" />
          <div className="skeleton-line mt-3 h-3 w-72 max-w-full rounded" />
        </div>
        <div className="skeleton-line h-10 w-24 rounded-xl" />
      </div>
      <div className="mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]">
        {[0, 1, 2].map((item) => (
          <div key={item} className="grid gap-2 border-b border-[var(--surface-border)] px-4 py-3 last:border-b-0 md:grid-cols-[1fr_120px]">
            <div className="skeleton-line h-4 w-full max-w-[520px] rounded" />
            <div className="skeleton-line h-4 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function onChainTeamToProfile(team: OnChainTeamView): TeamProfile {
  return {
    id: team.id,
    name: team.name,
    createdAt: team.createdAtSecs ? new Date(team.createdAtSecs * 1000).toISOString() : new Date().toISOString(),
    updatedAt: team.updatedAtSecs ? new Date(team.updatedAtSecs * 1000).toISOString() : new Date().toISOString(),
    members: team.members.map((member) => ({
      id: member.address,
      address: member.address.toLowerCase(),
      label: member.label || undefined,
      role: member.role === "operator" ? "operator" : "viewer",
    })),
    chain: { status: "registered" },
  };
}

function mergeTeams(primary: TeamProfile[], fallback: TeamProfile[]) {
  const seen = new Set(primary.map((team) => team.id));
  return [...primary, ...fallback.filter((team) => !seen.has(team.id))];
}
