import { getRootForTest } from "./connectServer"
import { isAbapStat, isAbapFile } from "../abapFile"
test("stat program ", async () => {
  const root = getRootForTest()
  const abapgit = await root.getNodeAsync(
    "/$TMP/$ABAPGIT/Source Code Library/Programs/ZABAPGIT/ZABAPGIT.prog.abap"
  )
  if (!isAbapFile(abapgit)) fail("Abap Object expected")
  await abapgit.stat()
  expect(abapgit.object.structure).toBeDefined()
})

test("stat interface ", async () => {
  const root = getRootForTest()
  const intf = await root.getNodeAsync(
    "/$TMP/Source Code Library/Interfaces/ZIF_APACK_MANIFEST.intf.abap"
  )
  if (!isAbapFile(intf)) fail("Abap Object expected")
  await intf.stat()
  expect(intf.object.structure).toBeDefined()
})