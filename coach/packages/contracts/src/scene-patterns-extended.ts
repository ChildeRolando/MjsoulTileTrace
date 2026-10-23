import {z} from "zod";
import {ScenePatternResultSchema} from "./scene-patterns.js";
export const EXTENDED_SCENE_PATTERN_VERSION="scene-patterns-extended/v1" as const;
export const ExtendedScenePatternResultSchema=ScenePatternResultSchema.extend({patternId:z.enum(["P19","P20","P21","P22"]),ruleVersion:z.literal(EXTENDED_SCENE_PATTERN_VERSION)});
export const ExtendedScenePatternPacketSchema=z.object({version:z.literal(EXTENDED_SCENE_PATTERN_VERSION),caseRef:z.string().min(1),results:z.array(ExtendedScenePatternResultSchema).length(4),text:z.string()}).strict();
export type ExtendedScenePatternResult=z.infer<typeof ExtendedScenePatternResultSchema>;
