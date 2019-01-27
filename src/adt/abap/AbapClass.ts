import { AbapObject, AbapNodeComponentByCategory } from "./AbapObject"
import { NodeStructure } from "../parsers/AdtNodeStructParser"

import { FileSystemError } from "vscode"
import { followLink } from "../../functions"
import { aggregateNodes } from "./AbapObjectUtilities"
import { isClassInclude } from "./AbapClassInclude"
import { ADTClient, isClassStructure, AbapClassStructure } from "abap-adt-api"
import { classIncludes } from "abap-adt-api/build/api"

export class AbapClass extends AbapObject {
  structure?: AbapClassStructure
  constructor(
    type: string,
    name: string,
    path: string,
    expandable?: string,
    techName?: string
  ) {
    super(type, name, path, expandable, techName)
  }

  async loadMetadata(client: ADTClient): Promise<AbapObject> {
    if (this.name) {
      const struc = await client.objectStructure(this.path)
      if (isClassStructure(struc)) {
        this.structure = struc
      }
    }
    return this
  }

  async getChildren(
    client: ADTClient
  ): Promise<Array<AbapNodeComponentByCategory>> {
    if (this.isLeaf()) throw FileSystemError.FileNotADirectory(this.vsName)
    if (!this.structure) await this.loadMetadata(client)
    if (!this.structure) throw FileSystemError.FileNotFound(this.vsName)

    const ns: NodeStructure = {
      categories: new Map(),
      objectTypes: new Map(),
      nodes: []
    }
    const main = this.selfLeafNode()
    main.OBJECT_URI = ADTClient.mainInclude(this.structure)
    const sources = ADTClient.classIncludes(this.structure)
    this.structure.includes.forEach(i => {
      const node = {
        EXPANDABLE: "",
        OBJECT_NAME: this.name + "." + i["adtcore:name"],
        OBJECT_TYPE: i["adtcore:type"],
        OBJECT_URI: sources.get(i["class:includeType"] as classIncludes) || "",
        OBJECT_VIT_URI: "",
        TECH_NAME: i["class:includeType"] //bit of a hack, used to match include metadata
      }
      if (node.OBJECT_URI) {
        if (i["abapsource:sourceUri"] === "source/main") ns.nodes.unshift(node)
        else ns.nodes.push(node)
      }
    })

    const aggregated = aggregateNodes(ns, this.type)
    for (const cat of aggregated)
      for (const type of cat.types)
        for (const incl of type.objects)
          if (isClassInclude(incl)) incl.setParent(this)

    return aggregated
  }
}