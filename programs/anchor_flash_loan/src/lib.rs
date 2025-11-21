use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, token::{Mint, Token, TokenAccount,transfer}
};
use anchor_lang::solana_program::sysvar::instructions::{load_instruction_at_checked, ID as INSTRUCTIONS_SYSVAR_ID};
use anchor_lang;

declare_id!("3iC2nNDQF52E2k2cHrtVKYZ7hoAgrTH7bftzxm1EmuJR");

#[program]
pub mod flash_loan {
    use anchor_lang::prelude::sysvar::instructions::load_current_index_checked;
    use anchor_spl::token::{self, Transfer};

    use super::*;

    pub fn loan(ctx: Context<Loan>,borrow_amount:u64) -> Result<()> {
        
        require!(borrow_amount > 0,ProtocolError::InvalidAmount);
        // humara program token transfer instruction bhejega toh seeds are needed to sign
        
        let seeds = &[
                    b"protocol".as_ref(),
                    &[ctx.bumps.protocol]
                ];
        
        let signer_seeds = &[&seeds[..]];

        // here comes the transfer instruction
        transfer(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(), 
            Transfer{
                from:ctx.accounts.protocol_ata.to_account_info(),
                to:ctx.accounts.borrower_ata.to_account_info(),
                authority:ctx.accounts.protocol.to_account_info()
            },
            signer_seeds
        ), borrow_amount)?;


        let ixs = ctx.accounts.instructions.to_account_info();
        let current_index = load_current_index_checked(&ixs)?;
        require_eq!(current_index,0,ProtocolError::InvalidIx);


        let instruction_sysvar = ixs.try_borrow_data()?;
        let len = u16::from_le_bytes(instruction_sysvar[0..2].try_into().unwrap());


        // So basically when we design the txns we make sure repay is at last so check at last
        if let Ok(repay_ix) = load_instruction_at_checked(len as usize - 1, &ixs) {
            require_keys_eq!(repay_ix.program_id,ID,ProtocolError::InvalidProgram);
            // checking the discriminator , which anchor uses to differentiate ixs
            require!(repay_ix.data[0..8].eq(instruction::Repay::DISCRIMINATOR), ProtocolError::InvalidIx);

            require_keys_eq!(repay_ix.accounts.get(3).ok_or(ProtocolError::InvalidBorrowerAta)?.pubkey, ctx.accounts.borrower_ata.key(), ProtocolError::InvalidBorrowerAta);
            require_keys_eq!(repay_ix.accounts.get(4).ok_or(ProtocolError::InvalidProtocolAta)?.pubkey, ctx.accounts.protocol_ata.key(), ProtocolError::InvalidProtocolAta);
        }
        else {
            return Err(ProtocolError::MissingRepayIx.into());
        }
        Ok(())
    }

    pub fn repay(ctx: Context<Loan>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Loan<'info> {
    #[account(mut)]
    pub borrower:Signer<'info>,         // Ye hai User
    #[account(
        seeds = [b"protocol".as_ref()],
        bump
    )]
    pub protocol:SystemAccount<'info>,          // Ye hai PDA which holds protocol liquidity pool
    pub mint:Account<'info,Mint>,                // Mint jiske saath work karna h
    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint = mint,
        associated_token::authority = borrower,
    )]
    pub borrower_ata:Account<'info,TokenAccount>,
    #[account(
        associated_token::mint = mint,
        associated_token::authority = protocol,
    )]
    pub protocol_ata:Account<'info,TokenAccount>,

    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    /// CHECK: InstructionsSysvar account
    pub instructions: UncheckedAccount<'info>,          // ye basically contains all the ix in the tx
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub system_program:Program<'info,System>,
}


#[error_code]
pub enum ProtocolError {
    #[msg("Invalid Amount")]
    InvalidAmount,
    #[msg("Invalid Instruction")]
    InvalidIx,
    #[msg("Invalid Program")]
    InvalidProgram,
    #[msg("Invalid Borrower ATA")]
    InvalidBorrowerAta,
    #[msg("Invalid Protocol ATA")]
    InvalidProtocolAta,
    #[msg("Missing Repay Instruction")]
    MissingRepayIx
    
}