  
THE 2026 Practical Data Community

**STATE OF DATA ENGINEERING**

SURVEY REPORT

A comprehensive survey of 1,101 data professionals

on tools, trends, challenges, and the future of the field

February 2026

# **Executive Summary**

The 2026 State of Data Engineering Survey provides an in-depth look at the current landscape of data engineering, based on responses from 1,101 data professionals across six continents. The survey was conducted from December 2025 to early January 2026 via the Practical Data community and LinkedIn, capturing insights from practitioners, managers, and architects across industries, including technology, healthcare, finance, and manufacturing.

### **Key Findings at a Glance**

* **Data professionals using AI tools daily or more frequently**  82%  
* **Cite legacy systems and technical debt as their biggest bottleneck**  25%  
* **Expect their data teams to grow in 2026**  42%  
* **Use cloud data warehouses as their primary storage/processing environment**  44%

The survey reveals a field in transition. While cloud data warehouses remain dominant, lakehouse architectures are gaining ground, particularly in Europe and Latin America. AI tools have become ubiquitous, with only 3.7% of respondents finding them unhelpful. However, organizational challenges, including poor leadership direction and unclear requirements, continue to outweigh technical obstacles as the primary impediments to success.

Perhaps most notably, data modeling has emerged as a critical pain point. Nearly 90% of respondents report challenges with their modeling approach, with pressure to move fast and a lack of clear ownership topping the list. This finding aligns with strong demand for data modeling education, which ranks second among requested training topics, behind AI/LLM integration.

# **Methodology**

## **Survey Design and Distribution**

The survey consisted of 17 questions covering role demographics, technology stack, AI adoption, organizational challenges, and future outlook. Questions included single-select, multi-select, and open-text formats to capture both quantitative trends and qualitative insights.

The survey was distributed through two primary channels: the Practical Data community (Substack and newsletter subscribers) and LinkedIn. Data collection occurred over a two-week period in late 2025\.

## **Response Demographics**

A total of 1,101 complete responses were received. The respondent pool skews toward experienced practitioners, with a significant representation of managers and directors, reflecting the distribution channels' reach.

| Respondent Role | Count | Percentage |
| :---- | :---: | :---: |
| Data Engineer | 423 | 38.4% |
| Manager / Director / VP | 226 | 20.5% |
| Analytics Engineer | 153 | 13.9% |
| Data Architect | 131 | 11.9% |
| Software Engineer (data focus) | 37 | 3.4% |
| Platform Engineer | 18 | 1.6% |
| ML Engineer / MLOps | 13 | 1.2% |
| AI Engineer | 13 | 1.2% |
| Other | 87 | 7.9% |

## **Geographic Distribution**

Responses came from six geographic regions, with North America and Europe comprising the majority of the sample.

| Region | Count | Percentage |
| :---- | :---: | :---: |
| United States / Canada | 436 | 39.6% |
| Europe (EU / UK) | 432 | 39.2% |
| Asia-Pacific | 94 | 8.5% |
| Latin America | 52 | 4.7% |
| Australia / New Zealand | 52 | 4.7% |
| Middle East / Africa | 28 | 2.5% |

## **Organization Size**

The sample represents a balanced distribution across organization sizes, from startups to large enterprises.

| Organization Size | Count | Percentage |
| :---- | :---: | :---: |
| 10,000+ employees | 229 | 20.8% |
| 1,000-10,000 employees | 311 | 28.2% |
| 200-999 employees | 231 | 21.0% |
| 50-199 employees | 156 | 14.2% |
| Under 50 employees | 174 | 15.8% |

# **Infrastructure and Architecture**

## **Primary Storage and Processing Environment**

Cloud data warehouses remain the dominant paradigm, used by 44% of respondents. However, lakehouse architectures have established a significant foothold at 27%, reflecting the maturation of technologies like Databricks, Apache Iceberg, Hudi, and Delta Lake.

| Environment | Percentage |
| :---- | :---: |
| Cloud Data Warehouse (Snowflake, BigQuery, Redshift) | 43.8% |
| Lakehouse (Databricks, Iceberg/Hudi/Delta) | 26.8% |
| Mixed/Hybrid | 11.7% |
| On-premises Data Warehouse | 9.4% |
| Cloud PostgreSQL/MySQL | 4.3% |
| Other | 4.0% |

Regional variations are notable. North American organizations show stronger cloud data warehouse adoption (50%), while European respondents report more balanced adoption between warehouses (40%) and lakehouses (33%). Latin America shows the highest lakehouse adoption at 40%.

## **Orchestration Approaches**

Orchestration remains fragmented, with Airflow (in various forms) leading but far from universal. A concerning 20.5% of respondents report having no orchestration or relying on ad-hoc approaches.

| Orchestration Approach | Percentage |
| :---- | :---: |
| Cloud-native (Composer, MWAA, etc.) | 24.4% |
| Self-managed Airflow | 22.9% |
| No orchestration / Ad-hoc | 20.5% |
| Dagster | 6.2% |
| Prefect | 1.3% |
| Other (Databricks Jobs, dbt, SSIS, etc.) | 24.7% |

Dagster shows notably higher adoption in smaller organizations (11% in sub-50-employee companies) compared to enterprises (3% in 10,000+ employee organizations), suggesting it may be gaining traction as a modern alternative in greenfield environments.

## **Architectural Trends**

When asked which architectural trend they are most aligned with, respondents preferred centralized approaches, though this varied significantly by organization size.

| Architecture Trend | Overall | \<50 Emp. | 10,000+ Emp. |
| :---- | :---: | :---: | :---: |
| Centralized Warehouse | 40.1% | 43% | 29% |
| Lakehouse | 34.6% | 29% | 38% |
| Data Mesh / Federated | 16.2% | 10% | 27% |
| Event-driven Architecture | 6.8% | 15% | 4% |

Data mesh adoption nearly triples from startups (10%) to large enterprises (27%), reflecting the organizational complexity that drives federated ownership models. Conversely, smaller organizations favor centralized warehouses, likely due to simpler organizational structures and smaller team sizes.

# **AI Tools and Adoption**

## **Personal AI Tool Usage**

AI tools have achieved near-universal adoption among data professionals. A remarkable 82% of respondents use AI tools (such as ChatGPT, Claude, Cursor, or GitHub Copilot) daily or more frequently.

| Usage Frequency | Percentage |
| :---- | :---: |
| Multiple times per day | 54.0% |
| Daily | 28.2% |
| Weekly | 10.7% |
| Rarely | 6.1% |
| Never | 1.0% |

AI Engineers and ML Engineers show the highest adoption rates (92%+ daily usage), but even traditionally less technical roles like Data Architects report 79% daily usage. Only 3.7% of respondents reported not finding AI helpful for their work.

## **How AI Helps Most**

Respondents were asked to select up to two areas where AI provides the most value. Code generation dominates, followed by documentation and pipeline debugging.

| AI Use Case | % Selected |
| :---- | :---: |
| Writing Code (SQL, Python, etc.) | \~82% |
| Documentation / Data Discovery | \~56% |
| Pipeline Debugging | \~29% |
| Architecture Design | \~21% |
| Data Modeling | \~13% |
| Governance / Quality Checks | \~11% |

## **Organizational AI Adoption**

While individual AI tool usage is high, organizational AI adoption shows a different picture. Most organizations are still in the early stages of systematic AI integration.

| Adoption Stage | Percentage |
| :---- | :---: |
| Using AI for tactical tasks | 33.8% |
| Experimenting | 30.5% |
| Building internal AI platforms | 13.6% |
| No meaningful adoption yet | 12.2% |
| AI embedded in most workflows | 9.9% |

Tech companies lead in advanced AI adoption, with 31% either building AI platforms or embedding AI into workflows, compared to just 12% in the public sector. Organizations with higher AI adoption also show more optimistic team growth projections: 50% of those with embedded AI expect growth, versus 32% of those with no adoption.

# **Data Modeling Practices**

## **Current Modeling Approaches**

Data modeling approaches remain diverse, with no single methodology dominating. The Mixed approach, where modeling style depends on use case, is the most common response.

| Modeling Approach | Percentage |
| :---- | :---: |
| Mixed (depends on use case) | 36.8% |
| Kimball-style dimensional modeling | 27.8% |
| Ad-hoc / tables added as needed | 17.4% |
| Canonical/semantic models | 5.4% |
| One Big Table | 3.8% |
| Event-driven modeling | 3.3% |
| Data Vault | 3.3% |

Modeling approaches correlate with architectural choices. Organizations aligned with centralized warehouses show higher Kimball adoption (34%), while those pursuing data mesh favor mixed approaches (44%) and show lower ad-hoc modeling (11%).

## **Data Modeling Pain Points**

Nearly 90% of respondents report at least one data modeling pain point, revealing this as a critical area of industry-wide struggle.

| Pain Point | % Selected |
| :---- | :---: |
| Pressure to move fast | 59.3% |
| Lack of clear ownership | 50.7% |
| Hard to maintain over time | 39.2% |
| Tools do not support good modeling | 18.7% |
| None / modeling is going well | 11.3% |
| AI tools produce inconsistent schemas | 4.3% |

The correlation between the modeling approach and operational health is striking. Organizations using ad-hoc modeling report the highest rates of firefighting (38%), while those with canonical/semantic models report the lowest (19%). This suggests that investment in thoughtful modeling approaches pays dividends in reduced operational burden.

# **Organizational Challenges**

## **Biggest Bottlenecks**

Respondents were asked to identify the single biggest bottleneck in their data organization. The results reveal that organizational and process issues outweigh purely technical challenges.

| Bottleneck | Percentage |
| :---- | :---: |
| Legacy systems / technical debt | 25.4% |
| Lack of leadership direction | 21.3% |
| Poor requirements / upstream issues | 18.8% |
| Talent / hiring challenges | 11.4% |
| Data quality issues | 10.1% |
| Compute costs | 5.2% |
| Tool complexity | 2.7% |

While legacy systems top the list, the combined weight of organizational challenges (leadership direction, requirements, and talent) exceeds technical debt. This finding aligns with themes in the open-text responses, in which respondents frequently emphasized that data engineering success is a people problem as much as a technology one.

## **Where Teams Spend Their Time**

Respondents selected up to two areas where their teams spend the most time, revealing priorities and potential inefficiencies.

| Activity | % Selected |
| :---- | :---: |
| Data modeling / transformation | 55.4% |
| Ingestion / pipelines | 48.1% |
| Analytics / BI | 34.2% |
| Data quality / reliability | 34.0% |
| Fighting fires | 26.2% |
| Infrastructure / platform work | 25.1% |
| ML / AI | 10.8% |

More than one in four teams (26.2%) report that fighting fires consumes significant time, representing substantial lost productivity across the industry.

# **Team Outlook and Industry Sentiment**

## **Team Growth Expectations for 2026**

The outlook for data teams is cautiously optimistic, with more respondents expecting growth than contraction.

| Expectation | Percentage |
| :---- | :---: |
| Stay the same | 43.7% |
| Grow | 42.0% |
| Not sure | 7.3% |
| Shrink | 7.1% |

Growth expectations correlate with organizational context. Teams whose primary bottleneck is talent/hiring are most bullish (59% expect growth), while those struggling with leadership direction are most pessimistic (35% expect growth, 10% expect shrinkage).

## **Education and Training Priorities**

Respondents were asked what topic they most want education or training on in the coming year.

| Topic | Count |
| :---- | :---: |
| AI/LLM integration | 235 |
| Data modeling | 211 |
| Semantics / ontologies / knowledge graphs | 209 |
| Architecture patterns | 180 |
| Streaming / event-driven systems | 94 |
| Career growth / leadership | 80 |
| Reliability engineering | 66 |

The strong demand for semantics, ontologies, and knowledge graphs, combined with the earlier finding that only 5.4% currently use canonical/semantic models, suggests an emerging area of interest with significant room for adoption.

# **Industry Voices: What Practitioners Wish Others Understood**

Respondents were asked: What is one thing you wish the wider industry understood about data engineering? The open-text responses reveal several recurring themes.

### **It Is a People Problem**

Multiple respondents emphasized that data engineering challenges are fundamentally organizational rather than technical: Data is a team sport; it requires sponsorship and alignment across both business and technical users to be fully successful. Another simply noted: "It is all a people problem."

### **Foundations Matter More Than Tools**

A consistent theme emerged around the importance of fundamentals over tooling: Data Engineering is not about the tools you use, but most jobs seem to require practice with tools. Respondents expressed frustration with tool-focused discourse: I would like to see more people talking about foundations; more articles and talks about timeless tools.

### **Data Engineering Is Not Just Old Software Engineering**

Several respondents pushed back on the perception that data engineering is simply software engineering with different data: It is not just software engineering from ten years ago but has its own challenges that software engineers do not need to worry about.

### **Quality and Governance Cannot Be Afterthoughts**

Data quality emerged as a persistent concern: Data quality cannot be fixed by one person, team, or department, no matter how hard you shout. Respondents emphasized the need for shift-left approaches: Data quality starts left.

### **It Takes Time**

Finally, practitioners expressed frustration with unrealistic expectations about timelines. As one respondent put it succinctly: It is not a project. It is a program that needs to be treated as a capital investment.

# **Conclusions and Implications**

## **Key Takeaways**

1. **AI adoption is no longer optional.** With 82% of practitioners using AI tools daily, organizations that do not enable AI-assisted development are putting their teams at a competitive disadvantage.

2. **Organizational challenges outweigh technical ones.** Leadership direction, clear requirements, and proper ownership are cited as bigger obstacles than tool complexity or compute costs.

3. **Data modeling is in crisis.** Nearly 90% of respondents report modeling pain points, with pressure to move fast and lack of ownership leading the list. Organizations with disciplined modeling approaches spend less time firefighting.

4. **Architecture is converging around warehouse and lakehouse.** Together, these paradigms represent over 70% of primary environments, with data mesh gaining traction primarily in large enterprises.

5. **Team growth outlook is cautiously positive.** With 42% expecting growth and only 7% expecting shrinkage, the field remains healthy despite macroeconomic uncertainties.

## **Looking Ahead**

The data engineering field in 2026 faces a dual challenge: rapidly integrating AI capabilities while addressing longstanding organizational and methodological gaps. The strong demand for education in data modeling, semantic layers, and architecture patterns suggests that practitioners recognize these gaps and are seeking to address them.

Organizations that invest in foundational practices, including thoughtful data modeling, clear ownership structures, and leadership alignment, will be better positioned to capitalize on AI capabilities. Those who prioritize speed over sustainability may find themselves trapped in cycles of technical debt and firefighting.

The message from the community is clear: data engineering success requires treating data as a strategic asset worthy of sustained investment, not a tactical problem to be solved with the next tool or platform migration.

**About This Report**

This survey was conducted and published on behalf of the Practical Data Community.   
No vendors or other commercial interests influenced this survey. This is a grassroots initiative.

For questions or media inquiries, contact joe@joereismedia.com