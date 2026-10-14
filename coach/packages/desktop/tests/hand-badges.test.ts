import {describe,it,expect} from "vitest";
import type {ReviewBoardDto,Tile} from "@riichi-coach/contracts";
import {handBadgeSlots} from "../src/renderer/review-workspace.js";
const tile:Tile={id:"5p",red:false};
const board=(extra:Partial<ReviewBoardDto>={})=>({hand:[tile,tile,{...tile,red:true}],draw:tile,actualTile:tile,...extra}) as ReviewBoardDto;
describe("physical hand badges",()=>{
 it("separates identical hand copies from the draw",()=>{const result=handBadgeSlots(board({actualDiscardMode:"tsumogiri",mortalDiscards:[{tile,discardMode:"tedashi"}]}));expect(result.actual).toBe(3);expect([...result.mortal]).toEqual([0]);});
 it("keeps both marks when choices coincide and distinguishes red fives",()=>{const red={...tile,red:true};const result=handBadgeSlots(board({actualTile:red,actualDiscardMode:"tedashi",mortalDiscards:[{tile:red,discardMode:"tedashi"},{tile:red,discardMode:"tedashi"}]}));expect(result.actual).toBe(2);expect([...result.mortal]).toEqual([2]);});
 it("does not invent absent or non-discard model choices",()=>{expect([...handBadgeSlots(board()).mortal]).toEqual([]);expect([...handBadgeSlots(board({mortalDiscards:[{tile:{id:"9m",red:false},discardMode:"tedashi"},{tile:{...tile,red:true},discardMode:"tsumogiri"}]})).mortal]).toEqual([]);});
});
