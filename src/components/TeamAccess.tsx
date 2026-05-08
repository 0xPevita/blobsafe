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
    <div className="grid gap-5">
      <section className="premium-surface rounded-2xl p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div>
            <p className="font-display text-base font-semibold text-frost">Recipient groups</p>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-frost-muted">
              Save wallet groups for repeated sharing. Each recipient receives an individual on-chain grant.
            </p>
          </div>
          <span className="accent-chip w-fit rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
            {teams.length} group{teams.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
          <label className="grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">group name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Core contributors"
              className="min-h-11 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
            />
          </label>

          <label className="grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">
              recipient wallets
            </span>
            <textarea
              value={membersText}
              onChange={(event) => setMembersText(event.target.value)}
              placeholder={"0xabc...\n0xdef... alice"}
              className="min-h-[130px] resize-y rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-4 py-3 font-mono text-xs leading-6 text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
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

      {teams.length === 0 ? (
        <div className="premium-surface flex min-h-[220px] flex-col items-center justify-center rounded-2xl px-6 py-12 text-center">
          <UsersRound size={30} className="mb-4 text-frost-muted" />
          <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">No recipient groups</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-frost-dim">
            Create a group once, then grant file access to every recipient from the file drawer.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {teams.map((team) => (
            <section key={team.id} className="premium-surface rounded-2xl p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-xl font-semibold tracking-[-0.02em] text-frost">{team.name}</p>
                    <span className="accent-chip rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                      {team.members.length} members
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-frost-muted">
                    owner {accountAddress ? truncateAddress(accountAddress) : "none"} | {team.chain?.status === "registered" ? "on-chain" : "local"}
                  </p>
                  {team.chain?.txHash && (
                    <p className="mt-1 break-all font-mono text-[11px] text-frost-muted">
                      tx {team.chain.txHash}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyTeam(team)}
                    className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
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

              <div className="mt-4 divide-y divide-[var(--surface-border)] rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]">
                {team.members.map((member) => (
                  <div key={member.address} className="grid gap-1 px-4 py-3 md:grid-cols-[1fr_120px] md:gap-4">
                    <p className="break-all font-mono text-xs text-frost">{member.address}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">
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
