// Imported for its side effect by every shim so the store is seeded before first use.
import { initStore } from "./store";
import { contentDocs, seedUserDocs } from "./seedData";

initStore(contentDocs(), seedUserDocs);
