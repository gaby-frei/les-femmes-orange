## **Technical Specifications and Infrastructure**

**Host Clarification:** Both api.brainstorm.world and [brainstormserver.nosfabrica.com](http://brainstormserver.nosfabrica.com) resolve to the same domain: 74.208.86.220. We will use api.brainstorm.world for all ORE calls. B[rainstormserver.nosfabrica.com](http://brainstormserver.nosfabrica.com) is subject to depreciation. 

## **Codebase Distinctions**

**Tapestry Repository (R\&D)**  
The Tapestry repository serves as Brainstorm's official **Research & Development** hub. It introduces advanced graph concepts (e.g., taggings) that are NOT currently integrated into the production site (brainstorm.world). Test features from this repository are deployed at:  
\-tapestry.brainstorm.world  
\-tags.brainstorm.world  
\-staging.brainstorm.world

Reference the following documentation for guidance as needed:   
[https://github.com/nous-clawds4/tapestry/tree/main/protocols](https://github.com/nous-clawds4/tapestry/tree/main/protocols)  
[https://github.com/nous-clawds4/tapestry/blob/main/BIBLE.md](https://github.com/nous-clawds4/tapestry/blob/main/BIBLE.md)

**Nosfabrica Codebases (Production)**  
The live *brainstorm.world* environment is powered by the Nosfabrica codebases, specifically.   
\-Github.com/nosfabrica/brainstorm\_server  
\-Github.com/nosfabrica/Brainstorm-UI (staging deployed at brainstorm-staging.nosfabrica.com)

Both Brainstorm’s production and R\&D codebases use GrapeRank to calculate npub trust scores based on FOLLOWS, MUTES, and REPORTS.   
\*\*Note that taggings are NOT an input for calculating trust scores.\*\*

## **Integration Guidelines for LFO App**

The Tapestry and Nosfabrica codebases implement certain behaviors, such as search functionality, differently. To ensure consistency, the LFO App must align its search and ranking behavior with *brainstorm.world*.

**\-Primary Provider:** Use api.brainstorm.world as the open ranking provider for all HTTP/JSON web-of-trust interfaces. Open ranking implementation is public at https://github.com/NosFabrica/brainstorm\_server/tree/main/app/routers/open\_ranking'

**\-Secondary Provider:** Interface with tapestry.brainstorm.world endpoints **only** when the required behaviors are not yet available in the production Nosfabrica codebases. Open ranking implementation is public at 'https://github.com/nous-clawds4/tapestry/tree/main/src/api/open-ranking'

## **Note on POV Availability** 

The conclusions drawn from the 2026-08-05 personalization probe, reconfirmed today, are now adopted policy. Search and ranking queries no longer revert to the default brainstorm house POV, correcting the behavior observed in earlier probes.

- A personalized call to the ORE search endpoint using a *non*\-*provisioned* pubkey’s POV returns empty.   
- A personalized call to the ORE search endpoint using a *provisioned* pubkey’s POV returns results distinct from those returned from the *global* perspective. 

Today in LFO Hub, we check if a pubkey is provisioned by querying for non-zero pubkey ranks among a small set. This check will soon be replaced when the production facing ORE contract is updated to return a special message with personalization requests. You can preview the change here (currently siloed to R\&D): https://tapestry.brainstorm.world/developers/open-ranking.  
