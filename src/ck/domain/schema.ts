import { z } from 'zod';

export const ISODateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ContentSettingsSchema = z
  .object({
    intimacy: z.enum(['abstract', 'detailed']).default('detailed'),
    violence: z.enum(['abstract', 'strong']).default('strong'),
    supernatural: z.enum(['off', 'ambiguous']).default('ambiguous'),
    explicitContentMinAge: z.literal(18).default(18),
  })
  .strict();

export const ModelLayerSettingsSchema = z
  .object({
    presetName: z.string().default('in_use'),
    model: z.string().optional(),
    maxCallsPerPulse: z.number().int().min(0).max(12).default(3),
  })
  .strict();

export const GameSettingsSchema = z
  .object({
    regularWorldPulseDays: z.number().int().min(3).max(30).default(7),
    content: ContentSettingsSchema.prefault({}),
    models: z
      .object({
        sceneDirector: ModelLayerSettingsSchema.prefault({}),
        worldPlanner: ModelLayerSettingsSchema.prefault({ maxCallsPerPulse: 1 }),
        keyCharacter: ModelLayerSettingsSchema.prefault({ maxCallsPerPulse: 3 }),
      })
      .strict()
      .prefault({}),
  })
  .strict();

export const ResourcesSchema = z
  .object({
    gold: z.number().int(),
    prestige: z.number().int(),
    legitimacy: z.number().int().min(0).max(100),
    stress: z.number().int().min(0).max(300),
    levies: z.number().int().min(0),
  })
  .strict();

export const CharacterSchema = z
  .object({
    id: z.string(),
    nameKey: z.string(),
    originalName: z.string(),
    birthDate: ISODateSchema,
    sex: z.enum(['female', 'male']),
    houseId: z.string(),
    dynastyId: z.string(),
    parentIds: z.array(z.string()).default([]),
    spouseIds: z.array(z.string()).default([]),
    titleIds: z.array(z.string()).default([]),
    liegeId: z.string().nullable().default(null),
    locationId: z.string(),
    alive: z.boolean().default(true),
    imprisonedById: z.string().nullable().default(null),
    traits: z.array(z.string()).default([]),
    goals: z.array(z.string()).default([]),
    knowledgeIds: z.array(z.string()).default([]),
    sourceType: z.enum(['attested', 'composite', 'original']),
  })
  .strict();

export const TitleSchema = z
  .object({
    id: z.string(),
    nameKey: z.string(),
    rank: z.enum(['barony', 'county', 'duchy', 'kingdom', 'empire']),
    holderId: z.string().nullable(),
    deJureLiegeId: z.string().nullable(),
    deFactoLiegeId: z.string().nullable(),
    countyId: z.string().nullable().default(null),
  })
  .strict();

export const MapPointSchema = z.tuple([z.number(), z.number()]);

export const CountySchema = z
  .object({
    id: z.string(),
    nameKey: z.string(),
    originalName: z.string(),
    titleId: z.string(),
    polygon: z.array(MapPointSchema).min(3),
    centroid: MapPointSchema,
    adjacentCountyIds: z.array(z.string()),
    locationIds: z.array(z.string()).min(2),
    controllerTitleId: z.string(),
    occupation: z
      .object({
        warId: z.string(),
        occupierTitleId: z.string(),
      })
      .strict()
      .nullable()
      .default(null),
    control: z.number().int().min(0).max(100).default(100),
  })
  .strict();

export const LocationSchema = z
  .object({
    id: z.string(),
    countyId: z.string(),
    nameKey: z.string(),
    kind: z.enum(['castle', 'city', 'temple', 'estate', 'inn', 'port', 'road']),
    position: MapPointSchema,
  })
  .strict();

export const KnowledgeFactSchema = z
  .object({
    id: z.string(),
    subjectId: z.string(),
    predicate: z.string(),
    value: z.unknown(),
    certainty: z.enum(['confirmed', 'reported', 'rumored', 'unknown']),
    sourceId: z.string(),
    observedAt: ISODateSchema,
    visibility: z.enum(['public', 'private', 'secret']),
  })
  .strict();

export const RelationshipDimensionSchema = z.enum(['opinion', 'trust', 'fear', 'suspicion', 'attraction']);

export const RelationshipModifierSchema = z
  .object({
    id: z.string(),
    fromId: z.string(),
    toId: z.string(),
    dimension: RelationshipDimensionSchema,
    delta: z.number().int().min(-10).max(10),
    reasonCode: z.string(),
    sourceId: z.string(),
    sceneId: z.string(),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema.nullable(),
  })
  .strict();

export const PromiseSchema = z
  .object({
    id: z.string(),
    promisorId: z.string(),
    beneficiaryId: z.string(),
    kind: z.string(),
    terms: z.record(z.string(), z.unknown()),
    dueDate: ISODateSchema,
    status: z.enum(['active', 'fulfilled', 'broken', 'expired']),
    sourceId: z.string(),
  })
  .strict();

export const SupportCommitmentSchema = z
  .object({
    id: z.string(),
    supporterId: z.string(),
    beneficiaryId: z.string(),
    issueId: z.string(),
    grantedAt: ISODateSchema,
    expiresAt: ISODateSchema,
    status: z.enum(['active', 'withdrawn', 'fulfilled', 'broken']),
    conditionPromiseIds: z.array(z.string()),
    sourceId: z.string(),
  })
  .strict();

export const FactionSchema = z
  .object({
    id: z.string(),
    nameKey: z.string(),
    leaderId: z.string(),
    memberIds: z.array(z.string()),
    targetId: z.string(),
    issueId: z.string(),
    power: z.number().int().min(0).max(100),
    threshold: z.number().int().min(1).max(100),
    deadline: ISODateSchema,
    status: z.enum(['organizing', 'weakened', 'ultimatum', 'war', 'dissolved']),
  })
  .strict();

export const ActivitySchema = z
  .object({
    id: z.string(),
    type: z.enum(['feast', 'tour', 'travel', 'council']),
    hostId: z.string(),
    participantIds: z.array(z.string()),
    locationId: z.string(),
    phase: z.string(),
    startedAt: ISODateSchema,
    status: z.enum(['planned', 'active', 'completed', 'cancelled']),
    memoryIds: z.array(z.string()).default([]),
  })
  .strict();

export const CommunicationSchema = z
  .object({
    id: z.string(),
    senderId: z.string(),
    recipientId: z.string(),
    courierId: z.string().nullable(),
    subject: z.string(),
    body: z.string(),
    sentAt: ISODateSchema,
    deliverAt: ISODateSchema,
    status: z.enum(['in_transit', 'delivered', 'refused', 'intercepted']),
    interceptedById: z.string().nullable(),
    threadId: z.string(),
  })
  .strict();

export const TravelSchema = z
  .object({
    id: z.string(),
    leaderId: z.string(),
    companionIds: z.array(z.string()),
    routeCountyIds: z.array(z.string()).min(2),
    destinationLocationId: z.string(),
    routeKind: z.enum(['direct', 'safe']),
    progressIndex: z.number().int().nonnegative().default(0),
    currentCountyId: z.string(),
    departedAt: ISODateSchema,
    arriveAt: ISODateSchema,
    status: z.enum(['planned', 'travelling', 'arrived', 'cancelled']),
  })
  .strict();

export const ProjectSchema = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    countyId: z.string(),
    templateId: z.string(),
    startedAt: ISODateSchema,
    completeAt: ISODateSchema,
    status: z.enum(['active', 'completed', 'cancelled']),
  })
  .strict();

export const WarSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['county_claim', 'faction_revolt']),
    attackerId: z.string(),
    defenderId: z.string(),
    targetTitleId: z.string().nullable(),
    attackerScore: z.number().int().min(-100).max(100),
    raisedByIds: z.array(z.string()),
    objectiveCountyId: z.string().nullable(),
    routeCountyIds: z.array(z.string()),
    phase: z.enum(['declared', 'mobilizing', 'marching', 'siege', 'battle', 'negotiation', 'ended']),
    startedAt: ISODateSchema,
    endedAt: ISODateSchema.nullable(),
  })
  .strict();

export const WorldSignalSchema = z
  .object({
    id: z.string(),
    type: z.enum(['regular_pulse', 'major_change', 'local_activity', 'rule_notice']),
    kind: z.string(),
    occurredAt: ISODateSchema,
    scopeIds: z.array(z.string()),
    payload: z.record(z.string(), z.unknown()),
    consumed: z.boolean().default(false),
  })
  .strict();

export const DomainEventSchema = z
  .object({
    id: z.string(),
    revision: z.number().int().nonnegative(),
    type: z.string(),
    occurredAt: ISODateSchema,
    actorId: z.string().nullable(),
    sourceId: z.string(),
    idempotencyKey: z.string(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const ScenarioStateSchema = z
  .object({
    id: z.literal('brittany_1066_prologue'),
    phase: z.enum(['council', 'planning', 'travelling', 'arrival', 'feast', 'return', 'ultimatum', 'campaign']),
    deadline: ISODateSchema,
    feastId: z.string(),
    supportTargetIds: z.array(z.string()).length(3),
    requiredSupport: z.literal(2),
    selectedRegentId: z.string().nullable(),
    activeTravelId: z.string().nullable(),
    sceneCount: z.number().int().nonnegative(),
    result: z.enum(['pending', 'success', 'conceded', 'civil_war']).default('pending'),
    flags: z.record(z.string(), z.boolean()).default({}),
  })
  .strict();

export const GameStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    saveId: z.string(),
    revision: z.number().int().nonnegative(),
    rngState: z.number().int().nonnegative(),
    scenarioId: z.literal('brittany_1066_prologue'),
    contentPackIds: z.array(z.string()),
    currentDate: ISODateSchema,
    nextRegularPulseAt: ISODateSchema,
    worldActionCredit: z.number().nonnegative().default(0),
    playerCharacterId: z.string(),
    regentId: z.string().nullable(),
    resources: ResourcesSchema,
    settings: GameSettingsSchema,
    characters: z.record(z.string(), CharacterSchema),
    titles: z.record(z.string(), TitleSchema),
    counties: z.record(z.string(), CountySchema),
    locations: z.record(z.string(), LocationSchema),
    knowledge: z.record(z.string(), KnowledgeFactSchema),
    relationshipModifiers: z.array(RelationshipModifierSchema),
    promises: z.record(z.string(), PromiseSchema),
    supportCommitments: z.record(z.string(), SupportCommitmentSchema),
    factions: z.record(z.string(), FactionSchema),
    activities: z.record(z.string(), ActivitySchema),
    communications: z.record(z.string(), CommunicationSchema),
    travels: z.record(z.string(), TravelSchema),
    projects: z.record(z.string(), ProjectSchema),
    wars: z.record(z.string(), WarSchema),
    signals: z.array(WorldSignalSchema),
    eventLog: z.array(DomainEventSchema),
    scenario: ScenarioStateSchema,
  })
  .strict();

export const ActionCallSchema = z
  .object({
    actionId: z.string(),
    version: z.literal(1),
    actorId: z.string(),
    targetIds: z.array(z.string()),
    params: z.record(z.string(), z.unknown()),
    sourceId: z.string(),
    sceneId: z.string(),
    idempotencyKey: z.string(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export const CommandErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
  })
  .strict();

export const CommandResultSchema = z
  .object({
    status: z.enum(['committed', 'rejected', 'duplicate']),
    state: GameStateSchema,
    events: z.array(DomainEventSchema),
    errors: z.array(CommandErrorSchema),
  })
  .strict();

export type GameState = z.infer<typeof GameStateSchema>;
export type GameSettings = z.infer<typeof GameSettingsSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type County = z.infer<typeof CountySchema>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export type WorldSignal = z.infer<typeof WorldSignalSchema>;
export type ActionCall = z.infer<typeof ActionCallSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type RelationshipDimension = z.infer<typeof RelationshipDimensionSchema>;
