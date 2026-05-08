import { getNetworkScopedStorageKey, SHELBY_NETWORK_NAME } from "@/lib/shelby";

const TEAMS_STORAGE_KEY = "blobsafe-teams";

export type TeamRole = "viewer" | "operator";

export type TeamMember = {
  id: string;
  address: string;
  label?: string;
  role: TeamRole;
};

export type TeamProfile = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
  chain?: {
    status: "registered" | "failed" | "local";
    txHash?: string;
    error?: string;
  };
};

const randomId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

const normalizeAccount = (account?: string) => account?.trim().toLowerCase() || "";

const legacyStorageKeyForAccount = (account?: string) => {
  const normalized = normalizeAccount(account);
  return normalized ? `${TEAMS_STORAGE_KEY}:${normalized}` : TEAMS_STORAGE_KEY;
};

const storageKeyForAccount = (account?: string) =>
  getNetworkScopedStorageKey(TEAMS_STORAGE_KEY, account);

const readTeamsFromKey = (key: string): TeamProfile[] => {
  const stored = window.localStorage.getItem(key);
  if (!stored) return [];
  const parsed = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.filter(isTeamProfile) : [];
};

export const normalizeTeamAddress = (address: string) => address.trim().toLowerCase();

export const isValidAptosAddress = (address: string) => /^0x[a-f0-9]{1,64}$/i.test(address.trim());

export const readTeams = (account?: string): TeamProfile[] => {
  try {
    const scoped = readTeamsFromKey(storageKeyForAccount(account));
    if (scoped.length > 0 || SHELBY_NETWORK_NAME !== "shelbynet") return scoped;
    return readTeamsFromKey(legacyStorageKeyForAccount(account));
  } catch {
    return [];
  }
};

export const saveTeam = (team: TeamProfile, account?: string) => {
  const teams = readTeams(account);
  const next = [team, ...teams.filter((item) => item.id !== team.id)].slice(0, 30);
  window.localStorage.setItem(storageKeyForAccount(account), JSON.stringify(next));
};

export const removeTeam = (teamId: string, account?: string) => {
  const next = readTeams(account).filter((team) => team.id !== teamId);
  window.localStorage.setItem(storageKeyForAccount(account), JSON.stringify(next));
};

export const createTeam = ({
  name,
  members,
}: {
  name: string;
  members: TeamMember[];
}): TeamProfile => {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    members: dedupeMembers(members),
  };
};

export const parseTeamMembers = (value: string, role: TeamRole = "viewer"): TeamMember[] => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return dedupeMembers(lines.map((line) => {
    const [address, ...labelParts] = line.split(/[,\s]+/).filter(Boolean);
    return {
      id: randomId(),
      address: normalizeTeamAddress(address ?? ""),
      label: labelParts.join(" ") || undefined,
      role,
    };
  }));
};

export const teamToRecipientList = (team: TeamProfile): string[] =>
  dedupeMembers(team.members)
    .filter((member) => isValidAptosAddress(member.address))
    .map((member) => member.address);

const dedupeMembers = (members: TeamMember[]): TeamMember[] => {
  const seen = new Set<string>();
  const output: TeamMember[] = [];

  for (const member of members) {
    const address = normalizeTeamAddress(member.address);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    output.push({
      ...member,
      id: member.id || randomId(),
      address,
      role: member.role || "viewer",
    });
  }

  return output;
};

function isTeamProfile(value: unknown): value is TeamProfile {
  const team = value as TeamProfile | null;
  return Boolean(
    team &&
      typeof team.id === "string" &&
      typeof team.name === "string" &&
      Array.isArray(team.members)
  );
}
