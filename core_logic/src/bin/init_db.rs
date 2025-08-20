#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    core_logic::db::init_db().await?;
    Ok(())
}
