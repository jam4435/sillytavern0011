import { z } from 'zod';

export const ISODateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const DaySegmentSchema = z.enum(['morning', 'afternoon', 'evening']);

export const ContentSettingsSchema = z.object({
  intimacy: z.enum(['abstract', 'detailed']).default('detailed'),
  violence: z.enum(['abstract', 'strong']).default('strong'),
  supernatural: z.enum(['off', 'ambiguous']).default('ambiguous'),
  explicitContentMinAge: z.literal(18).default(18),
}).strict();

export const ModelLayerSettingsSchema = z.object({
  presetName: z.string().default('in_use'),
  model: z.string().optional(),
  maxCallsPerPulse: z.number().int().min(0).max(12).default(3),
}).strict();

export const GameSettingsSchema = z.object({
  regularWorldPulseDays: z.number().int().min(3).max(30).default(7),
  content: ContentSettingsSchema.prefault({}),
  models: z.object({
    sceneDirector: ModelLayerSettingsSchema.prefault({}),
    worldPlanner: ModelLayerSettingsSchema.prefault({ maxCallsPerPulse: 1 }),
    keyCharacter: ModelLayerSettingsSchema.prefault({ maxCallsPerPulse: 3 }),
  }).strict().prefault({}),
}).strict();

export const ResourcesSchema = z.object({
  gold: z.number().int(),
  prestige: z.number().int(),
  piety: z.number().int().default(0),
  legitimacy: z.number().int().min(0).max(100),
  stress: z.number().int().min(0).max(300),
  levies: z.number().int().min(0),
}).strict();

export const CharacterResourceSchema = z.object({
  gold: z.number().int(),
  prestige: z.number().int(),
  piety: z.number().int(),
  levies: z.number().int().nonnegative(),
  income: z.number(),
}).strict();

export const AttributesSchema = z.object({
  diplomacy: z.number().int().min(0).max(30),
  martial: z.number().int().min(0).max(30),
  stewardship: z.number().int().min(0).max(30),
  intrigue: z.number().int().min(0).max(30),
  learning: z.number().int().min(0).max(30),
  prowess: z.number().int().min(0).max(30),
}).strict();

export const PersonalitySchema = z.object({
  boldness: z.number().int().min(-100).max(100),
  compassion: z.number().int().min(-100).max(100),
  honor: z.number().int().min(-100).max(100),
}).strict();

export const CharacterSchema = z.object({
  id: z.string(),
  nameKey: z.string(),
  originalName: z.string(),
  birthDate: ISODateSchema,
  deathDate: ISODateSchema.nullable().default(null),
  sex: z.enum(['female', 'male']),
  houseId: z.string(),
  dynastyId: z.string(),
  parentIds: z.array(z.string()).default([]),
  childIds: z.array(z.string()).default([]),
  spouseIds: z.array(z.string()).default([]),
  betrothedIds: z.array(z.string()).default([]),
  titleIds: z.array(z.string()).default([]),
  liegeId: z.string().nullable().default(null),
  locationId: z.string(),
  alive: z.boolean().default(true),
  imprisonedById: z.string().nullable().default(null),
  traits: z.array(z.string()).default([]),
  attributes: AttributesSchema,
  personality: PersonalitySchema,
  health: z.number().min(0).max(10).default(5),
  fertility: z.number().min(0).max(1).default(0.5),
  stress: z.number().int().min(0).max(300).default(0),
  goals: z.array(z.string()).default([]),
  shortTermGoal: z.string().nullable().default(null),
  ambition: z.string().nullable().default(null),
  knowledgeIds: z.array(z.string()).default([]),
  memoryIds: z.array(z.string()).default([]),
  sourceType: z.enum(['attested', 'composite', 'original']),
}).strict();

export const TitleSchema = z.object({
  id: z.string(),
  nameKey: z.string(),
  rank: z.enum(['barony', 'county', 'duchy', 'kingdom', 'empire']),
  holderId: z.string().nullable(),
  deJureLiegeId: z.string().nullable(),
  deFactoLiegeId: z.string().nullable(),
  countyId: z.string().nullable().default(null),
  successionLaw: z.enum(['partition', 'primogeniture']).default('partition'),
}).strict();

export const MapPointSchema = z.tuple([z.number(), z.number()]);

export const CountySchema = z.object({
  id: z.string(),
  nameKey: z.string(),
  originalName: z.string(),
  titleId: z.string(),
  polygon: z.array(MapPointSchema).min(3),
  centroid: MapPointSchema,
  adjacentCountyIds: z.array(z.string()),
  locationIds: z.array(z.string()).min(2),
  controllerTitleId: z.string(),
  occupation: z.object({ warId: z.string(), occupierTitleId: z.string() }).strict().nullable().default(null),
  control: z.number().int().min(0).max(100).default(100),
  terrain: z.enum(['plains', 'farmlands', 'forest', 'hills', 'coastal']).default('plains'),
  development: z.number().int().min(0).max(100).default(10),
  baseTax: z.number().nonnegative().default(2),
  baseLevies: z.number().int().nonnegative().default(250),
  buildingIds: z.array(z.string()).default([]),
}).strict();

export const LocationSchema = z.object({
  id: z.string(),
  countyId: z.string(),
  nameKey: z.string(),
  kind: z.enum(['castle', 'city', 'temple', 'estate', 'inn', 'port', 'road']),
  position: MapPointSchema,
}).strict();

export const KnowledgeFactSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  predicate: z.string(),
  value: z.unknown(),
  certainty: z.enum(['confirmed', 'reported', 'rumored', 'unknown']),
  sourceId: z.string(),
  observedAt: ISODateSchema,
  visibility: z.enum(['public', 'private', 'secret']),
}).strict();

export const RelationshipDimensionSchema = z.enum(['opinion', 'trust', 'fear', 'suspicion', 'attraction']);

export const RelationshipModifierSchema = z.object({
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
}).strict();

export const MemorySchema = z.object({
  id: z.string(),
  characterId: z.string(),
  subjectIds: z.array(z.string()),
  kind: z.string(),
  summary: z.string(),
  intensity: z.number().int().min(1).max(100),
  createdAt: ISODateSchema,
  expiresAt: ISODateSchema.nullable(),
  visibility: z.enum(['public', 'private', 'secret']),
}).strict();

export const PromiseSchema = z.object({
  id: z.string(),
  promisorId: z.string(),
  beneficiaryId: z.string(),
  kind: z.string(),
  terms: z.record(z.string(), z.unknown()),
  dueDate: ISODateSchema,
  status: z.enum(['active', 'fulfilled', 'broken', 'expired']),
  sourceId: z.string(),
}).strict();

export const SupportCommitmentSchema = z.object({
  id: z.string(),
  supporterId: z.string(),
  beneficiaryId: z.string(),
  issueId: z.string(),
  grantedAt: ISODateSchema,
  expiresAt: ISODateSchema,
  status: z.enum(['active', 'withdrawn', 'fulfilled', 'broken']),
  conditionPromiseIds: z.array(z.string()),
  sourceId: z.string(),
}).strict();

export const FactionSchema = z.object({
  id: z.string(),
  nameKey: z.string(),
  kind: z.enum(['liberty', 'claimant', 'independence']),
  leaderId: z.string(),
  memberIds: z.array(z.string()),
  targetId: z.string(),
  issueId: z.string(),
  power: z.number().int().min(0).max(200),
  threshold: z.number().int().min(1).max(200),
  deadline: ISODateSchema.nullable(),
  status: z.enum(['organizing', 'weakened', 'ultimatum', 'war', 'dissolved']),
  createdAt: ISODateSchema,
}).strict();

export const ActivitySchema = z.object({
  id: z.string(),
  type: z.enum(['feast', 'tour', 'travel', 'council']),
  hostId: z.string(),
  participantIds: z.array(z.string()),
  invitedIds: z.array(z.string()).default([]),
  locationId: z.string(),
  phase: z.string(),
  startedAt: ISODateSchema,
  endsAt: ISODateSchema.nullable().default(null),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']),
  intent: z.string().nullable().default(null),
  memoryIds: z.array(z.string()).default([]),
}).strict();

export const CommunicationSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  courierId: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  sentAt: ISODateSchema,
  deliverAt: ISODateSchema,
  status: z.enum(['in_transit', 'delivered', 'refused', 'intercepted', 'answered']),
  interceptedById: z.string().nullable(),
  threadId: z.string(),
}).strict();

export const TravelSchema = z.object({
  id: z.string(),
  leaderId: z.string(),
  companionIds: z.array(z.string()),
  routeCountyIds: z.array(z.string()).min(1),
  destinationLocationId: z.string(),
  routeKind: z.enum(['direct', 'safe']),
  progressIndex: z.number().int().nonnegative().default(0),
  currentCountyId: z.string(),
  departedAt: ISODateSchema,
  arriveAt: ISODateSchema,
  status: z.enum(['planned', 'travelling', 'arrived', 'cancelled']),
}).strict();

export const ProjectSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  countyId: z.string(),
  templateId: z.enum(['watchtower', 'market']),
  startedAt: ISODateSchema,
  completeAt: ISODateSchema,
  status: z.enum(['active', 'completed', 'cancelled']),
}).strict();

export const WarSchema = z.object({
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
}).strict();

export const CouncilPositionSchema = z.object({
  id: z.string(),
  liegeId: z.string(),
  kind: z.enum(['chancellor', 'marshal', 'steward', 'spymaster', 'chaplain', 'regent']),
  holderId: z.string().nullable(),
  task: z.string().nullable(),
  appointedAt: ISODateSchema.nullable(),
}).strict();

export const FeudalContractSchema = z.object({
  id: z.string(),
  liegeId: z.string(),
  vassalId: z.string(),
  taxLevel: z.enum(['low', 'normal', 'high']),
  levyLevel: z.enum(['low', 'normal', 'high']),
  privileges: z.array(z.string()),
  modifiedAt: ISODateSchema,
}).strict();

export const ClaimSchema = z.object({
  id: z.string(),
  claimantId: z.string(),
  titleId: z.string(),
  strength: z.enum(['weak', 'pressed', 'implicit']),
  inherited: z.boolean(),
  createdAt: ISODateSchema,
}).strict();

export const MarriageSchema = z.object({
  id: z.string(),
  partnerIds: z.tuple([z.string(), z.string()]),
  status: z.enum(['proposed', 'betrothed', 'married', 'ended']),
  allianceIds: z.array(z.string()).default([]),
  createdAt: ISODateSchema,
  resolvedAt: ISODateSchema.nullable(),
}).strict();

export const SuccessionSchema = z.object({
  titleId: z.string(),
  law: z.enum(['partition', 'primogeniture']),
  heirIds: z.array(z.string()),
  updatedAt: ISODateSchema,
}).strict();

export const ExternalRealmSchema = z.object({
  id: z.string(),
  nameKey: z.string(),
  rulerId: z.string(),
  heirId: z.string().nullable(),
  strength: z.number().int().nonnegative(),
  stability: z.number().int().min(0).max(100),
  stanceToPlayer: z.enum(['hostile', 'wary', 'neutral', 'friendly', 'allied']),
  warSummary: z.string().nullable(),
  pressure: z.number().int().min(0).max(100),
  lastSimulatedAt: ISODateSchema,
}).strict();

export const SituationSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  nameKey: z.string(),
  participantIds: z.array(z.string()),
  phase: z.string(),
  startedAt: ISODateSchema,
  deadline: ISODateSchema.nullable(),
  status: z.enum(['active', 'resolved', 'failed', 'war']),
  metrics: z.record(z.string(), z.number()),
  flags: z.record(z.string(), z.boolean()),
  resolution: z.string().nullable(),
  sourcePackId: z.string(),
}).strict();

export const EventChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string().optional(),
}).strict();

export const PendingEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  occurredAt: ISODateSchema,
  severity: z.enum(['notice', 'major', 'critical']),
  scopeIds: z.array(z.string()),
  requiresResponse: z.boolean(),
  choices: z.array(EventChoiceSchema),
  status: z.enum(['pending', 'resolved', 'dismissed']),
  sourceId: z.string(),
}).strict();

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(['alert', 'message', 'situation', 'world', 'task']),
  title: z.string(),
  body: z.string(),
  createdAt: ISODateSchema,
  severity: z.enum(['info', 'warning', 'danger']),
  relatedIds: z.array(z.string()),
  read: z.boolean().default(false),
}).strict();

export const InteractionChannelSchema = z.enum(['meeting', 'letter', 'messenger', 'activity']);
export const InteractionStatusSchema = z.enum(['negotiating', 'awaiting_target', 'awaiting_player', 'accepted', 'rejected', 'countered', 'expired']);

export const InteractionMessageSchema = z.object({
  speakerId: z.string(),
  text: z.string(),
  createdAt: ISODateSchema,
}).strict();

export const InteractionThreadSchema = z.object({
  id: z.string(),
  intentId: z.string(),
  initiatorId: z.string(),
  targetId: z.string(),
  channel: InteractionChannelSchema,
  status: InteractionStatusSchema,
  terms: z.record(z.string(), z.unknown()),
  acceptance: z.number().int(),
  acceptanceReasons: z.array(z.object({ label: z.string(), value: z.number().int() }).strict()),
  messages: z.array(InteractionMessageSchema),
  createdAt: ISODateSchema,
  deadline: ISODateSchema.nullable(),
  sceneId: z.string(),
}).strict();

export const WorldSignalSchema = z.object({
  id: z.string(),
  type: z.enum(['regular_pulse', 'major_change', 'local_activity', 'rule_notice']),
  kind: z.string(),
  occurredAt: ISODateSchema,
  scopeIds: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
  consumed: z.boolean().default(false),
}).strict();

export const DomainEventSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative(),
  type: z.string(),
  occurredAt: ISODateSchema,
  actorId: z.string().nullable(),
  sourceId: z.string(),
  idempotencyKey: z.string(),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export const GameClockSchema = z.object({
  date: ISODateSchema,
  segment: DaySegmentSchema,
}).strict();

export const GameStateSchema = z.object({
  schemaVersion: z.literal(2),
  saveId: z.string(),
  revision: z.number().int().nonnegative(),
  rngState: z.number().int().nonnegative(),
  contentPackIds: z.array(z.string()),
  contentPackVersions: z.record(z.string(), z.string()),
  clock: GameClockSchema,
  currentDate: ISODateSchema,
  nextRegularPulseAt: ISODateSchema,
  worldActionCredit: z.number().nonnegative().default(0),
  playerCharacterId: z.string(),
  regentId: z.string().nullable(),
  activeTravelId: z.string().nullable(),
  resources: ResourcesSchema,
  characterResources: z.record(z.string(), CharacterResourceSchema),
  settings: GameSettingsSchema,
  characters: z.record(z.string(), CharacterSchema),
  titles: z.record(z.string(), TitleSchema),
  counties: z.record(z.string(), CountySchema),
  locations: z.record(z.string(), LocationSchema),
  knowledge: z.record(z.string(), KnowledgeFactSchema),
  memories: z.record(z.string(), MemorySchema),
  relationshipModifiers: z.array(RelationshipModifierSchema),
  promises: z.record(z.string(), PromiseSchema),
  supportCommitments: z.record(z.string(), SupportCommitmentSchema),
  factions: z.record(z.string(), FactionSchema),
  activities: z.record(z.string(), ActivitySchema),
  communications: z.record(z.string(), CommunicationSchema),
  travels: z.record(z.string(), TravelSchema),
  projects: z.record(z.string(), ProjectSchema),
  wars: z.record(z.string(), WarSchema),
  council: z.record(z.string(), CouncilPositionSchema),
  contracts: z.record(z.string(), FeudalContractSchema),
  claims: z.record(z.string(), ClaimSchema),
  marriages: z.record(z.string(), MarriageSchema),
  succession: z.record(z.string(), SuccessionSchema),
  externalRealms: z.record(z.string(), ExternalRealmSchema),
  situations: z.record(z.string(), SituationSchema),
  pendingEvents: z.record(z.string(), PendingEventSchema),
  notifications: z.record(z.string(), NotificationSchema),
  interactions: z.record(z.string(), InteractionThreadSchema),
  signals: z.array(WorldSignalSchema),
  eventLog: z.array(DomainEventSchema),
}).strict();

export const LegacyGameStateSchema = z.object({
  schemaVersion: z.literal(1),
  saveId: z.string(),
  revision: z.number().int().nonnegative(),
  rngState: z.number().int().nonnegative(),
  currentDate: ISODateSchema,
}).passthrough();

export const ActionCallSchema = z.object({
  actionId: z.string(),
  version: z.literal(1),
  actorId: z.string(),
  targetIds: z.array(z.string()),
  params: z.record(z.string(), z.unknown()),
  sourceId: z.string(),
  sceneId: z.string(),
  idempotencyKey: z.string(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

export const CommandErrorSchema = z.object({ code: z.string(), message: z.string() }).strict();
export const CommandResultSchema = z.object({
  status: z.enum(['committed', 'rejected', 'duplicate']),
  state: GameStateSchema,
  events: z.array(DomainEventSchema),
  errors: z.array(CommandErrorSchema),
}).strict();

export type GameState = z.infer<typeof GameStateSchema>;
export type GameSettings = z.infer<typeof GameSettingsSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type County = z.infer<typeof CountySchema>;
export type RelationshipDimension = z.infer<typeof RelationshipDimensionSchema>;
export type InteractionThread = z.infer<typeof InteractionThreadSchema>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export type WorldSignal = z.infer<typeof WorldSignalSchema>;
export type ActionCall = z.infer<typeof ActionCallSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
