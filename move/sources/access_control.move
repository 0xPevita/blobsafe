module blobsafe_addr::access_control {
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use std::signer;
    use std::string::{Self, String};
    use std::vector;

    const ENOT_INITIALIZED: u64 = 1;
    const EALREADY_INITIALIZED: u64 = 2;
    const ENOT_PUBLISHER: u64 = 3;
    const EFILE_NOT_FOUND: u64 = 4;
    const ENOT_FILE_OWNER: u64 = 5;
    const EDELETED_FILE: u64 = 6;
    const ESELF_GRANT: u64 = 7;
    const ETEAM_NOT_FOUND: u64 = 8;
    const ENOT_TEAM_OWNER: u64 = 9;
    const ETEAM_VECTOR_LENGTH: u64 = 10;

    struct Registry has key {
        files: Table<String, FileMetadata>,
        grants: Table<String, Table<address, Grant>>,
        file_ids: vector<String>,
    }

    struct AccessIndex has key {
        recipients: Table<String, vector<address>>,
    }

    struct TeamRegistry has key {
        teams: Table<String, TeamMetadata>,
        members: Table<String, vector<TeamMember>>,
        owner_team_ids: Table<address, vector<String>>,
    }

    struct GrantExpiryIndex has key {
        expiries: Table<String, Table<address, u64>>,
    }

    struct GrantExpiryLedger has key {
        expiries: Table<GrantKey, u64>,
    }

    struct GrantKey has copy, drop, store {
        blob_name: String,
        recipient: address,
    }

    struct FileMetadata has copy, drop, store {
        owner: address,
        blob_name: String,
        file_name: String,
        sha256: String,
        size: u64,
        expiration_micros: u64,
        created_at_secs: u64,
        updated_at_secs: u64,
        deleted: bool,
    }

    struct Grant has copy, drop, store {
        active: bool,
        encrypted_key: String,
        granted_at_secs: u64,
        revoked_at_secs: u64,
    }

    struct TeamMetadata has copy, drop, store {
        owner: address,
        team_id: String,
        name: String,
        created_at_secs: u64,
        updated_at_secs: u64,
        active: bool,
    }

    struct TeamMember has copy, drop, store {
        account: address,
        label: String,
        role: String,
    }

    #[event]
    struct FileRegistered has drop, store {
        owner: address,
        blob_name: String,
        file_name: String,
        sha256: String,
        size: u64,
        expiration_micros: u64,
    }

    #[event]
    struct AccessGranted has drop, store {
        owner: address,
        recipient: address,
        blob_name: String,
    }

    #[event]
    struct AccessRevoked has drop, store {
        owner: address,
        recipient: address,
        blob_name: String,
    }

    #[event]
    struct FileMarkedDeleted has drop, store {
        owner: address,
        blob_name: String,
    }

    #[event]
    struct TeamUpserted has drop, store {
        owner: address,
        team_id: String,
        name: String,
        member_count: u64,
    }

    #[event]
    struct TeamDeleted has drop, store {
        owner: address,
        team_id: String,
    }

    public entry fun init(publisher: &signer) {
        let publisher_addr = signer::address_of(publisher);
        assert!(publisher_addr == @blobsafe_addr, ENOT_PUBLISHER);
        assert!(!exists<Registry>(@blobsafe_addr), EALREADY_INITIALIZED);

        move_to(publisher, Registry {
            files: table::new<String, FileMetadata>(),
            grants: table::new<String, Table<address, Grant>>(),
            file_ids: vector::empty<String>(),
        });
    }

    public entry fun init_access_index(publisher: &signer) {
        let publisher_addr = signer::address_of(publisher);
        assert!(publisher_addr == @blobsafe_addr, ENOT_PUBLISHER);
        assert!(!exists<AccessIndex>(@blobsafe_addr), EALREADY_INITIALIZED);

        move_to(publisher, AccessIndex {
            recipients: table::new<String, vector<address>>(),
        });
    }

    public entry fun init_team_registry(publisher: &signer) {
        let publisher_addr = signer::address_of(publisher);
        assert!(publisher_addr == @blobsafe_addr, ENOT_PUBLISHER);
        assert!(!exists<TeamRegistry>(@blobsafe_addr), EALREADY_INITIALIZED);

        move_to(publisher, TeamRegistry {
            teams: table::new<String, TeamMetadata>(),
            members: table::new<String, vector<TeamMember>>(),
            owner_team_ids: table::new<address, vector<String>>(),
        });
    }

    public entry fun init_grant_expiry_index(publisher: &signer) {
        let publisher_addr = signer::address_of(publisher);
        assert!(publisher_addr == @blobsafe_addr, ENOT_PUBLISHER);
        assert!(!exists<GrantExpiryIndex>(@blobsafe_addr), EALREADY_INITIALIZED);

        move_to(publisher, GrantExpiryIndex {
            expiries: table::new<String, Table<address, u64>>(),
        });
    }

    public entry fun init_grant_expiry_ledger(publisher: &signer) {
        let publisher_addr = signer::address_of(publisher);
        assert!(publisher_addr == @blobsafe_addr, ENOT_PUBLISHER);
        assert!(!exists<GrantExpiryLedger>(@blobsafe_addr), EALREADY_INITIALIZED);

        move_to(publisher, GrantExpiryLedger {
            expiries: table::new<GrantKey, u64>(),
        });
    }

    public entry fun register_file(
        owner: &signer,
        blob_name: String,
        file_name: String,
        sha256: String,
        size: u64,
        expiration_micros: u64,
    ) acquires Registry {
        assert!(exists<Registry>(@blobsafe_addr), ENOT_INITIALIZED);

        let owner_addr = signer::address_of(owner);
        let now_secs = timestamp::now_seconds();
        let registry = borrow_global_mut<Registry>(@blobsafe_addr);

        if (table::contains(&registry.files, copy blob_name)) {
            let metadata = table::borrow_mut(&mut registry.files, copy blob_name);
            assert!(metadata.owner == owner_addr, ENOT_FILE_OWNER);
            metadata.file_name = copy file_name;
            metadata.sha256 = copy sha256;
            metadata.size = size;
            metadata.expiration_micros = expiration_micros;
            metadata.updated_at_secs = now_secs;
            metadata.deleted = false;
        } else {
            table::add(&mut registry.files, copy blob_name, FileMetadata {
                owner: owner_addr,
                blob_name: copy blob_name,
                file_name: copy file_name,
                sha256: copy sha256,
                size,
                expiration_micros,
                created_at_secs: now_secs,
                updated_at_secs: now_secs,
                deleted: false,
            });
            table::add(&mut registry.grants, copy blob_name, table::new<address, Grant>());
            vector::push_back(&mut registry.file_ids, copy blob_name);
        };

        event::emit(FileRegistered {
            owner: owner_addr,
            blob_name,
            file_name,
            sha256,
            size,
            expiration_micros,
        });
    }

    public entry fun grant_access(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex {
        assert!(exists<Registry>(@blobsafe_addr), ENOT_INITIALIZED);

        let owner_addr = signer::address_of(owner);
        assert!(owner_addr != recipient, ESELF_GRANT);

        let registry = borrow_global_mut<Registry>(@blobsafe_addr);
        assert!(table::contains(&registry.files, copy blob_name), EFILE_NOT_FOUND);

        let metadata = table::borrow(&registry.files, copy blob_name);
        assert!(metadata.owner == owner_addr, ENOT_FILE_OWNER);
        assert!(!metadata.deleted, EDELETED_FILE);

        if (!table::contains(&registry.grants, copy blob_name)) {
            table::add(&mut registry.grants, copy blob_name, table::new<address, Grant>());
        };

        let grants = table::borrow_mut(&mut registry.grants, copy blob_name);
        let now_secs = timestamp::now_seconds();

        if (table::contains(grants, recipient)) {
            let grant = table::borrow_mut(grants, recipient);
            grant.active = true;
            grant.encrypted_key = copy encrypted_key;
            grant.granted_at_secs = now_secs;
            grant.revoked_at_secs = 0;
        } else {
            table::add(grants, recipient, Grant {
                active: true,
                encrypted_key: copy encrypted_key,
                granted_at_secs: now_secs,
                revoked_at_secs: 0,
            });
        };

        index_recipient(copy blob_name, recipient);

        event::emit(AccessGranted {
            owner: owner_addr,
            recipient,
            blob_name,
        });
    }

    public entry fun grant_access_until(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
        expires_at_secs: u64,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access(owner, copy blob_name, recipient, encrypted_key);
        store_grant_expiry(blob_name, recipient, expires_at_secs);
    }

    public entry fun grant_access_3m(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 180);
    }

    public entry fun grant_access_15m(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 900);
    }

    public entry fun grant_access_1h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 3600);
    }

    public entry fun grant_access_2h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 7200);
    }

    public entry fun grant_access_6h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 21600);
    }

    public entry fun grant_access_12h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 43200);
    }

    public entry fun grant_access_24h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 86400);
    }

    public entry fun grant_access_7d(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 604800);
    }

    public entry fun grant_access_30d(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access_for(owner, blob_name, recipient, encrypted_key, 2592000);
    }

    public entry fun grant_access_timed_3m(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 180);
    }

    public entry fun grant_access_timed_15m(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 900);
    }

    public entry fun grant_access_timed_1h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 3600);
    }

    public entry fun grant_access_timed_2h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 7200);
    }

    public entry fun grant_access_timed_6h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 21600);
    }

    public entry fun grant_access_timed_12h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 43200);
    }

    public entry fun grant_access_timed_24h(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 86400);
    }

    public entry fun grant_access_timed_7d(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 604800);
    }

    public entry fun grant_access_timed_30d(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access_for_ledger(owner, blob_name, recipient, encrypted_key, 2592000);
    }

    fun grant_access_for(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
        ttl_secs: u64,
    ) acquires Registry, AccessIndex, GrantExpiryIndex {
        grant_access(owner, copy blob_name, recipient, encrypted_key);
        store_grant_expiry(blob_name, recipient, timestamp::now_seconds() + ttl_secs);
    }

    fun grant_access_for_ledger(
        owner: &signer,
        blob_name: String,
        recipient: address,
        encrypted_key: String,
        ttl_secs: u64,
    ) acquires Registry, AccessIndex, GrantExpiryLedger {
        grant_access(owner, copy blob_name, recipient, encrypted_key);
        store_grant_expiry_ledger(blob_name, recipient, timestamp::now_seconds() + ttl_secs);
    }

    public entry fun set_grant_expiry(
        owner: &signer,
        blob_name: String,
        recipient: address,
        expires_at_secs: u64,
    ) acquires Registry, GrantExpiryIndex {
        assert!(exists<Registry>(@blobsafe_addr), ENOT_INITIALIZED);

        let owner_addr = signer::address_of(owner);
        let registry = borrow_global<Registry>(@blobsafe_addr);
        assert!(table::contains(&registry.files, copy blob_name), EFILE_NOT_FOUND);

        let metadata = table::borrow(&registry.files, copy blob_name);
        assert!(metadata.owner == owner_addr, ENOT_FILE_OWNER);
        assert!(!metadata.deleted, EDELETED_FILE);
        assert!(table::contains(&registry.grants, copy blob_name), EFILE_NOT_FOUND);

        let grants = table::borrow(&registry.grants, copy blob_name);
        assert!(table::contains(grants, recipient), EFILE_NOT_FOUND);

        let grant = table::borrow(grants, recipient);
        assert!(grant.active, EFILE_NOT_FOUND);

        store_grant_expiry(blob_name, recipient, expires_at_secs);
    }

    public entry fun set_grant_expiry_3m(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 180);
    }

    public entry fun set_grant_expiry_15m(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 900);
    }

    public entry fun set_grant_expiry_1h(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 3600);
    }

    public entry fun set_grant_expiry_2h(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 7200);
    }

    public entry fun set_grant_expiry_6h(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 21600);
    }

    public entry fun set_grant_expiry_12h(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 43200);
    }

    public entry fun set_grant_expiry_24h(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 86400);
    }

    public entry fun set_grant_expiry_7d(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 604800);
    }

    public entry fun set_grant_expiry_30d(owner: &signer, blob_name: String, recipient: address) acquires Registry, GrantExpiryIndex {
        set_grant_expiry_after(owner, blob_name, recipient, 2592000);
    }

    fun set_grant_expiry_after(
        owner: &signer,
        blob_name: String,
        recipient: address,
        ttl_secs: u64,
    ) acquires Registry, GrantExpiryIndex {
        let expires_at_secs = timestamp::now_seconds() + ttl_secs;
        set_grant_expiry(owner, blob_name, recipient, expires_at_secs);
    }

    public entry fun revoke_access(
        owner: &signer,
        blob_name: String,
        recipient: address,
    ) acquires Registry {
        assert!(exists<Registry>(@blobsafe_addr), ENOT_INITIALIZED);

        let owner_addr = signer::address_of(owner);
        let registry = borrow_global_mut<Registry>(@blobsafe_addr);
        assert!(table::contains(&registry.files, copy blob_name), EFILE_NOT_FOUND);

        let metadata = table::borrow(&registry.files, copy blob_name);
        assert!(metadata.owner == owner_addr, ENOT_FILE_OWNER);

        if (table::contains(&registry.grants, copy blob_name)) {
            let grants = table::borrow_mut(&mut registry.grants, copy blob_name);
            if (table::contains(grants, recipient)) {
                let grant = table::borrow_mut(grants, recipient);
                grant.active = false;
                grant.revoked_at_secs = timestamp::now_seconds();
            };
        };

        event::emit(AccessRevoked {
            owner: owner_addr,
            recipient,
            blob_name,
        });
    }

    fun index_recipient(blob_name: String, recipient: address) acquires AccessIndex {
        if (!exists<AccessIndex>(@blobsafe_addr)) {
            return
        };

        let index = borrow_global_mut<AccessIndex>(@blobsafe_addr);
        if (!table::contains(&index.recipients, copy blob_name)) {
            table::add(&mut index.recipients, copy blob_name, vector::empty<address>());
        };

        let recipients = table::borrow_mut(&mut index.recipients, blob_name);
        if (!vector::contains(recipients, &recipient)) {
            vector::push_back(recipients, recipient);
        };
    }

    fun store_grant_expiry(blob_name: String, recipient: address, expires_at_secs: u64) acquires GrantExpiryIndex {
        if (!exists<GrantExpiryIndex>(@blobsafe_addr)) {
            return
        };

        let index = borrow_global_mut<GrantExpiryIndex>(@blobsafe_addr);
        if (!table::contains(&index.expiries, copy blob_name)) {
            table::add(&mut index.expiries, copy blob_name, table::new<address, u64>());
        };

        let expiries = table::borrow_mut(&mut index.expiries, blob_name);
        if (table::contains(expiries, recipient)) {
            *table::borrow_mut(expiries, recipient) = expires_at_secs;
        } else {
            table::add(expiries, recipient, expires_at_secs);
        };
    }

    fun store_grant_expiry_ledger(blob_name: String, recipient: address, expires_at_secs: u64) acquires GrantExpiryLedger {
        if (!exists<GrantExpiryLedger>(@blobsafe_addr)) {
            return
        };

        let ledger = borrow_global_mut<GrantExpiryLedger>(@blobsafe_addr);
        let key = GrantKey { blob_name, recipient };
        if (table::contains(&ledger.expiries, copy key)) {
            *table::borrow_mut(&mut ledger.expiries, key) = expires_at_secs;
        } else {
            table::add(&mut ledger.expiries, key, expires_at_secs);
        };
    }

    public entry fun mark_deleted(owner: &signer, blob_name: String) acquires Registry {
        assert!(exists<Registry>(@blobsafe_addr), ENOT_INITIALIZED);

        let owner_addr = signer::address_of(owner);
        let registry = borrow_global_mut<Registry>(@blobsafe_addr);
        assert!(table::contains(&registry.files, copy blob_name), EFILE_NOT_FOUND);

        let metadata = table::borrow_mut(&mut registry.files, copy blob_name);
        assert!(metadata.owner == owner_addr, ENOT_FILE_OWNER);
        metadata.deleted = true;
        metadata.updated_at_secs = timestamp::now_seconds();

        event::emit(FileMarkedDeleted {
            owner: owner_addr,
            blob_name,
        });
    }

    public entry fun upsert_team(
        owner: &signer,
        team_id: String,
        name: String,
        member_accounts: vector<address>,
        member_labels: vector<String>,
        member_roles: vector<String>,
    ) acquires TeamRegistry {
        assert!(exists<TeamRegistry>(@blobsafe_addr), ENOT_INITIALIZED);
        assert!(vector::length(&member_accounts) == vector::length(&member_labels), ETEAM_VECTOR_LENGTH);
        assert!(vector::length(&member_accounts) == vector::length(&member_roles), ETEAM_VECTOR_LENGTH);

        let owner_addr = signer::address_of(owner);
        let now_secs = timestamp::now_seconds();
        let registry = borrow_global_mut<TeamRegistry>(@blobsafe_addr);
        let member_count = vector::length(&member_accounts);

        if (table::contains(&registry.teams, copy team_id)) {
            let metadata = table::borrow_mut(&mut registry.teams, copy team_id);
            assert!(metadata.owner == owner_addr, ENOT_TEAM_OWNER);
            metadata.name = copy name;
            metadata.updated_at_secs = now_secs;
            metadata.active = true;
            *table::borrow_mut(&mut registry.members, copy team_id) =
                build_team_members(member_accounts, member_labels, member_roles);
        } else {
            table::add(&mut registry.teams, copy team_id, TeamMetadata {
                owner: owner_addr,
                team_id: copy team_id,
                name: copy name,
                created_at_secs: now_secs,
                updated_at_secs: now_secs,
                active: true,
            });
            table::add(
                &mut registry.members,
                copy team_id,
                build_team_members(member_accounts, member_labels, member_roles),
            );
            index_team(registry, owner_addr, copy team_id);
        };

        event::emit(TeamUpserted {
            owner: owner_addr,
            team_id,
            name,
            member_count,
        });
    }

    public entry fun delete_team(owner: &signer, team_id: String) acquires TeamRegistry {
        assert!(exists<TeamRegistry>(@blobsafe_addr), ENOT_INITIALIZED);

        let owner_addr = signer::address_of(owner);
        let registry = borrow_global_mut<TeamRegistry>(@blobsafe_addr);
        assert!(table::contains(&registry.teams, copy team_id), ETEAM_NOT_FOUND);

        let metadata = table::borrow_mut(&mut registry.teams, copy team_id);
        assert!(metadata.owner == owner_addr, ENOT_TEAM_OWNER);
        metadata.active = false;
        metadata.updated_at_secs = timestamp::now_seconds();

        event::emit(TeamDeleted {
            owner: owner_addr,
            team_id,
        });
    }

    fun build_team_members(
        member_accounts: vector<address>,
        member_labels: vector<String>,
        member_roles: vector<String>,
    ): vector<TeamMember> {
        let output = vector::empty<TeamMember>();
        let index = 0;
        let len = vector::length(&member_accounts);

        while (index < len) {
            vector::push_back(&mut output, TeamMember {
                account: *vector::borrow(&member_accounts, index),
                label: *vector::borrow(&member_labels, index),
                role: *vector::borrow(&member_roles, index),
            });
            index = index + 1;
        };

        output
    }

    fun index_team(registry: &mut TeamRegistry, owner: address, team_id: String) {
        if (!table::contains(&registry.owner_team_ids, owner)) {
            table::add(&mut registry.owner_team_ids, owner, vector::empty<String>());
        };

        let ids = table::borrow_mut(&mut registry.owner_team_ids, owner);
        if (!vector::contains(ids, &team_id)) {
            vector::push_back(ids, team_id);
        };
    }

    #[view]
    public fun module_version(): u64 {
        6
    }

    #[view]
    public fun runtime_status(): (bool, bool, bool) {
        (
            exists<Registry>(@blobsafe_addr),
            exists<AccessIndex>(@blobsafe_addr),
            exists<TeamRegistry>(@blobsafe_addr),
        )
    }

    #[view]
    public fun grant_expiry_status(): bool {
        exists<GrantExpiryIndex>(@blobsafe_addr)
    }

    #[view]
    public fun grant_expiry_ledger_status(): bool {
        exists<GrantExpiryLedger>(@blobsafe_addr)
    }

    #[view]
    public fun is_registered(blob_name: String): bool acquires Registry {
        if (!exists<Registry>(@blobsafe_addr)) {
            return false
        };

        let registry = borrow_global<Registry>(@blobsafe_addr);
        table::contains(&registry.files, copy blob_name)
    }

    #[view]
    public fun has_access(blob_name: String, user: address): bool acquires Registry, GrantExpiryIndex, GrantExpiryLedger {
        if (!exists<Registry>(@blobsafe_addr)) {
            return false
        };

        let registry = borrow_global<Registry>(@blobsafe_addr);
        if (!table::contains(&registry.files, copy blob_name)) {
            return false
        };

        let metadata = table::borrow(&registry.files, copy blob_name);
        if (metadata.deleted) {
            return false
        };

        if (metadata.owner == user) {
            return true
        };

        if (!table::contains(&registry.grants, copy blob_name)) {
            return false
        };

        let grants = table::borrow(&registry.grants, copy blob_name);
        if (!table::contains(grants, user)) {
            return false
        };

        let grant = table::borrow(grants, user);
        grant.active && grant_not_expired(copy blob_name, user)
    }

    fun grant_not_expired(blob_name: String, user: address): bool acquires GrantExpiryIndex, GrantExpiryLedger {
        let (has_ledger_expiry, ledger_expires_at_secs, ledger_expired) = get_grant_expiry_v2(copy blob_name, user);
        if (has_ledger_expiry) {
            return ledger_expires_at_secs == 0 || !ledger_expired
        };

        let (has_expiry, expires_at_secs, expired) = get_grant_expiry(blob_name, user);
        !has_expiry || expires_at_secs == 0 || !expired
    }

    #[view]
    public fun get_file(blob_name: String): (bool, address, String, String, String, u64, u64, bool) acquires Registry {
        if (!exists<Registry>(@blobsafe_addr)) {
            return (false, @0x0, empty_string(), empty_string(), empty_string(), 0, 0, false)
        };

        let registry = borrow_global<Registry>(@blobsafe_addr);
        if (!table::contains(&registry.files, copy blob_name)) {
            return (false, @0x0, empty_string(), empty_string(), empty_string(), 0, 0, false)
        };

        let metadata = table::borrow(&registry.files, copy blob_name);
        let metadata_value = *metadata;
        (
            true,
            metadata_value.owner,
            metadata_value.blob_name,
            metadata_value.file_name,
            metadata_value.sha256,
            metadata_value.size,
            metadata_value.expiration_micros,
            metadata_value.deleted,
        )
    }

    #[view]
    public fun get_grant(blob_name: String, recipient: address): (bool, bool, String, u64, u64) acquires Registry {
        if (!exists<Registry>(@blobsafe_addr)) {
            return (false, false, empty_string(), 0, 0)
        };

        let registry = borrow_global<Registry>(@blobsafe_addr);
        if (!table::contains(&registry.grants, copy blob_name)) {
            return (false, false, empty_string(), 0, 0)
        };

        let grants = table::borrow(&registry.grants, copy blob_name);
        if (!table::contains(grants, recipient)) {
            return (false, false, empty_string(), 0, 0)
        };

        let grant = table::borrow(grants, recipient);
        let grant_value = *grant;
        (
            true,
            grant_value.active,
            grant_value.encrypted_key,
            grant_value.granted_at_secs,
            grant_value.revoked_at_secs,
        )
    }

    #[view]
    public fun get_grant_expiry(blob_name: String, recipient: address): (bool, u64, bool) acquires GrantExpiryIndex {
        if (!exists<GrantExpiryIndex>(@blobsafe_addr)) {
            return (false, 0, false)
        };

        let index = borrow_global<GrantExpiryIndex>(@blobsafe_addr);
        if (!table::contains(&index.expiries, copy blob_name)) {
            return (false, 0, false)
        };

        let expiries = table::borrow(&index.expiries, copy blob_name);
        if (!table::contains(expiries, recipient)) {
            return (false, 0, false)
        };

        let expires_at_secs = *table::borrow(expiries, recipient);
        if (expires_at_secs == 0) {
            return (true, 0, false)
        };

        (true, expires_at_secs, timestamp::now_seconds() > expires_at_secs)
    }

    #[view]
    public fun get_grant_expiry_v2(blob_name: String, recipient: address): (bool, u64, bool) acquires GrantExpiryLedger {
        if (!exists<GrantExpiryLedger>(@blobsafe_addr)) {
            return (false, 0, false)
        };

        let ledger = borrow_global<GrantExpiryLedger>(@blobsafe_addr);
        let key = GrantKey { blob_name, recipient };
        if (!table::contains(&ledger.expiries, copy key)) {
            return (false, 0, false)
        };

        let expires_at_secs = *table::borrow(&ledger.expiries, key);
        if (expires_at_secs == 0) {
            return (true, 0, false)
        };

        (true, expires_at_secs, timestamp::now_seconds() > expires_at_secs)
    }

    #[view]
    public fun get_recipients(blob_name: String): vector<address> acquires AccessIndex {
        if (!exists<AccessIndex>(@blobsafe_addr)) {
            return vector::empty<address>()
        };

        let index = borrow_global<AccessIndex>(@blobsafe_addr);
        if (!table::contains(&index.recipients, copy blob_name)) {
            return vector::empty<address>()
        };

        *table::borrow(&index.recipients, blob_name)
    }

    #[view]
    public fun get_owner_team_ids(owner: address): vector<String> acquires TeamRegistry {
        if (!exists<TeamRegistry>(@blobsafe_addr)) {
            return vector::empty<String>()
        };

        let registry = borrow_global<TeamRegistry>(@blobsafe_addr);
        if (!table::contains(&registry.owner_team_ids, owner)) {
            return vector::empty<String>()
        };

        *table::borrow(&registry.owner_team_ids, owner)
    }

    #[view]
    public fun get_team(
        team_id: String,
    ): (bool, address, String, String, bool, u64, u64, vector<address>, vector<String>, vector<String>) acquires TeamRegistry {
        if (!exists<TeamRegistry>(@blobsafe_addr)) {
            return (false, @0x0, empty_string(), empty_string(), false, 0, 0, vector::empty<address>(), vector::empty<String>(), vector::empty<String>())
        };

        let registry = borrow_global<TeamRegistry>(@blobsafe_addr);
        if (!table::contains(&registry.teams, copy team_id)) {
            return (false, @0x0, empty_string(), empty_string(), false, 0, 0, vector::empty<address>(), vector::empty<String>(), vector::empty<String>())
        };

        let metadata = *table::borrow(&registry.teams, copy team_id);
        let members = table::borrow(&registry.members, team_id);
        let accounts = vector::empty<address>();
        let labels = vector::empty<String>();
        let roles = vector::empty<String>();
        let index = 0;
        let len = vector::length(members);

        while (index < len) {
            let member = *vector::borrow(members, index);
            vector::push_back(&mut accounts, member.account);
            vector::push_back(&mut labels, member.label);
            vector::push_back(&mut roles, member.role);
            index = index + 1;
        };

        (
            true,
            metadata.owner,
            metadata.team_id,
            metadata.name,
            metadata.active,
            metadata.created_at_secs,
            metadata.updated_at_secs,
            accounts,
            labels,
            roles,
        )
    }

    fun empty_string(): String {
        string::utf8(b"")
    }

    #[test_only]
    fun setup_for_test(publisher: &signer) {
        init(publisher);
        init_team_registry(publisher);
        init_grant_expiry_index(publisher);
        init_grant_expiry_ledger(publisher);
    }

    #[test(framework = @0x1, blobsafe = @blobsafe_addr, owner = @0xA11CE, recipient = @0xB0B)]
    fun test_register_grant_revoke_delete(
        framework: &signer,
        blobsafe: &signer,
        owner: &signer,
        recipient: &signer,
    ) acquires Registry, AccessIndex, GrantExpiryIndex, GrantExpiryLedger {
        timestamp::set_time_has_started_for_testing(framework);
        setup_for_test(blobsafe);
        init_access_index(blobsafe);

        let recipient_addr = signer::address_of(recipient);
        let blob_name = string::utf8(b"blobsafe/encrypted/team/roadmap.pdf");
        register_file(
            owner,
            copy blob_name,
            string::utf8(b"roadmap.pdf"),
            string::utf8(b"abcdef"),
            128,
            999999,
        );

        assert!(is_registered(copy blob_name), 100);
        assert!(has_access(copy blob_name, signer::address_of(owner)), 101);
        assert!(!has_access(copy blob_name, recipient_addr), 102);

        grant_access(
            owner,
            copy blob_name,
            recipient_addr,
            string::utf8(b"{\"ciphertext\":\"wrapped\"}"),
        );

        assert!(has_access(copy blob_name, recipient_addr), 103);
        let recipients = get_recipients(copy blob_name);
        assert!(vector::length(&recipients) == 1, 112);
        assert!(*vector::borrow(&recipients, 0) == recipient_addr, 113);

        let (grant_exists, grant_active, encrypted_key, _, revoked_at) =
            get_grant(copy blob_name, recipient_addr);
        assert!(grant_exists, 104);
        assert!(grant_active, 105);
        assert!(encrypted_key == string::utf8(b"{\"ciphertext\":\"wrapped\"}"), 106);
        assert!(revoked_at == 0, 107);

        grant_access_until(
            owner,
            copy blob_name,
            recipient_addr,
            string::utf8(b"{\"ciphertext\":\"wrapped-ttl\"}"),
            86400,
        );
        let (has_expiry, expires_at_secs, expired) = get_grant_expiry(copy blob_name, recipient_addr);
        assert!(has_expiry, 114);
        assert!(expires_at_secs == 86400, 115);
        assert!(!expired, 116);

        set_grant_expiry(owner, copy blob_name, recipient_addr, 900);
        let (updated_has_expiry, updated_expires_at_secs, updated_expired) =
            get_grant_expiry(copy blob_name, recipient_addr);
        assert!(updated_has_expiry, 117);
        assert!(updated_expires_at_secs == 900, 118);
        assert!(!updated_expired, 119);

        set_grant_expiry_15m(owner, copy blob_name, recipient_addr);
        let (preset_has_expiry, preset_expires_at_secs, preset_expired) =
            get_grant_expiry(copy blob_name, recipient_addr);
        assert!(preset_has_expiry, 120);
        assert!(preset_expires_at_secs >= 900, 121);
        assert!(!preset_expired, 122);

        grant_access_3m(
            owner,
            copy blob_name,
            recipient_addr,
            string::utf8(b"{\"ciphertext\":\"wrapped-3m\"}"),
        );
        let (combined_has_expiry, combined_expires_at_secs, combined_expired) =
            get_grant_expiry(copy blob_name, recipient_addr);
        assert!(combined_has_expiry, 123);
        assert!(combined_expires_at_secs >= 180, 124);
        assert!(!combined_expired, 125);

        grant_access_timed_15m(
            owner,
            copy blob_name,
            recipient_addr,
            string::utf8(b"{\"ciphertext\":\"wrapped-ledger\"}"),
        );
        let (ledger_has_expiry, ledger_expires_at_secs, ledger_expired) =
            get_grant_expiry_v2(copy blob_name, recipient_addr);
        assert!(ledger_has_expiry, 126);
        assert!(ledger_expires_at_secs >= 900, 127);
        assert!(!ledger_expired, 128);

        revoke_access(owner, copy blob_name, recipient_addr);
        assert!(!has_access(copy blob_name, recipient_addr), 108);

        mark_deleted(owner, copy blob_name);
        assert!(!has_access(copy blob_name, signer::address_of(owner)), 109);

        let (file_exists, _, _, _, _, _, _, deleted) = get_file(blob_name);
        assert!(file_exists, 110);
        assert!(deleted, 111);
    }

    #[test(framework = @0x1, blobsafe = @blobsafe_addr, owner = @0xA11CE)]
    fun test_upsert_and_delete_team(
        framework: &signer,
        blobsafe: &signer,
        owner: &signer,
    ) acquires TeamRegistry {
        timestamp::set_time_has_started_for_testing(framework);
        setup_for_test(blobsafe);

        let accounts = vector[@0xB0B, @0xCAFE];
        let labels = vector[string::utf8(b"bob"), string::utf8(b"cafe")];
        let roles = vector[string::utf8(b"viewer"), string::utf8(b"operator")];
        let team_id = string::utf8(b"team-core");

        upsert_team(
            owner,
            copy team_id,
            string::utf8(b"Core team"),
            accounts,
            labels,
            roles,
        );

        let ids = get_owner_team_ids(signer::address_of(owner));
        assert!(vector::length(&ids) == 1, 120);

        let (exists_team, owner_addr, _, name, active, _, _, member_accounts, _, member_roles) =
            get_team(copy team_id);
        assert!(exists_team, 121);
        assert!(owner_addr == signer::address_of(owner), 122);
        assert!(name == string::utf8(b"Core team"), 123);
        assert!(active, 124);
        assert!(vector::length(&member_accounts) == 2, 125);
        assert!(*vector::borrow(&member_roles, 1) == string::utf8(b"operator"), 126);

        delete_team(owner, copy team_id);
        let (_, _, _, _, active_after_delete, _, _, _, _, _) = get_team(team_id);
        assert!(!active_after_delete, 127);
    }
}
