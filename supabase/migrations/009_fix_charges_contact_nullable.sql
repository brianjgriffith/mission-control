-- Allow charges to have no contact (some SamCart orders may lack email)
alter table charges alter column contact_id drop not null;
