import { useState } from 'react';
import type { GroupPubkeyType, PubkeyType } from 'libsession_util_nodejs';
import styled from 'styled-components';

import { getAppDispatch } from '../../state/dispatch';
import {
  updateConfirmModal,
  updateConversationSettingsModal,
  updateManageGroupAdminsModal,
} from '../../state/ducks/modalDialog';
import { groupInfoActions } from '../../state/ducks/metaGroups';
import {
  useLibGroupSuperAdmin,
  useMemberGroupChangePending,
  useStateOf03GroupMembers,
} from '../../state/selectors/groups';
import { useConversationUsernameWithFallback, useWeAreAdmin } from '../../hooks/useParamSelector';
import { PubKey } from '../../session/types';
import { ToastUtils, UserUtils } from '../../session/utils';
import { tr } from '../../localization/localeTools';
import { MemberListItem } from '../MemberListItem';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SpacerLG, SpacerSM } from '../basic/Text';
import { SessionSpinner } from '../loading';
import { StyledContactListInModal } from '../list/StyledContactList';
import {
  ModalActionsContainer,
  ModalBasicHeader,
  SessionWrapperModal,
  WrapperModalWidth,
} from '../SessionWrapperModal';
import { kickAdminAndRecreateGroup } from '../../interactions/conversations/kickAdmin';

type Props = {
  conversationId: string;
};

const StyledSectionLabel = styled.div`
  padding: var(--margins-xs) var(--margins-sm);
  color: var(--text-secondary-color);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
`;

const StyledSuperAdminLabel = styled.div`
  padding: 0 var(--margins-sm);
  color: var(--text-secondary-color);
  font-size: var(--font-size-sm);
  text-align: center;
`;

const StyledHint = styled.div`
  padding: 0 var(--margins-lg);
  color: var(--text-secondary-color);
  font-size: var(--font-size-xs);
  text-align: center;
`;

const StyledDescription = styled.div`
  padding: 0 var(--margins-lg);
  color: var(--text-primary-color);
  font-size: var(--font-size-sm);
  text-align: center;
  line-height: 18px;
`;

/**
 * NOTE: [react-compiler] kept out of the component: the compiler cannot yet handle
 * value blocks (optional chaining and friends) inside a try/catch.
 */
async function runAdminAction(action: () => Promise<unknown>, successToast?: string) {
  try {
    await action();
    if (successToast) {
      ToastUtils.pushToastSuccess('superAdminAction', successToast);
    }
  } catch (e) {
    window?.log?.warn('ManageGroupAdminsDialog: action failed with', e.message);
    ToastUtils.pushToastError('superAdminAction', tr('superAdminActionFailedDev'));
  }
}

/**
 * Apocentro "Manage admins": the desktop half of the group super admin feature.
 *
 * A group has at most one super admin -- the only admin allowed to remove members.
 * The role lives in an invisible tag on the group description (see util/superAdmin.ts),
 * so it syncs to every client through the normal group config.
 */
export const ManageGroupAdminsDialog = (props: Props) => {
  const { conversationId } = props;
  const dispatch = getAppDispatch();

  const us = UserUtils.getOurPubKeyStrFromCache();
  const members = useStateOf03GroupMembers(conversationId);
  const superAdminId = useLibGroupSuperAdmin(conversationId);
  const weAreAdmin = useWeAreAdmin(conversationId);
  const isProcessingUIChange = useMemberGroupChangePending();

  const [selected, setSelected] = useState<string | null>(null);

  const superAdminName = useConversationUsernameWithFallback(true, superAdminId || us);

  const admins = members.filter(m => m.nominatedAdmin);
  const plainMembers = members.filter(m => !m.nominatedAdmin);

  const weAreSuperAdmin = !!superAdminId && superAdminId === us;
  const selectedIsAdmin = !!selected && admins.some(m => m.pubkeyHex === selected);
  const anAdminIsPicked = selectedIsAdmin && selected !== us;

  const canClaim = weAreAdmin && !superAdminId;

  const closeDialog = () => {
    dispatch(updateManageGroupAdminsModal(null));
  };

  const setSuperAdminTo = async (accountId: string) => {
    if (!PubKey.is03Pubkey(conversationId)) {
      return;
    }
    const groupPk: GroupPubkeyType = conversationId;

    await runAdminAction(
      () =>
        (
          dispatch(
            groupInfoActions.currentDeviceGroupSuperAdminChange({
              groupPk,
              superAdminId: accountId as PubkeyType,
            }) as any
          ) as any
        ).unwrap(),
      tr('superAdminUpdatedDev')
    );
  };

  const kickSelectedAdmin = async () => {
    if (!PubKey.is03Pubkey(conversationId) || !selected) {
      return;
    }
    const groupPk: GroupPubkeyType = conversationId;
    const toKick = selected as PubkeyType;

    await runAdminAction(async () => {
      await kickAdminAndRecreateGroup(groupPk, toKick);
      // the group this screen was opened from is gone now, so its settings go too
      dispatch(updateConversationSettingsModal(null));
      closeDialog();
    }, tr('kickAdminDoneDev'));
  };

  const askToClaim = () => {
    dispatch(
      updateConfirmModal({
        title: { token: 'claimSuperAdminDev' },
        i18nMessage: { token: 'claimSuperAdminConfirmDev' },
        okText: { token: 'claimSuperAdminDev' },
        okTheme: SessionButtonColor.Danger,
        onClickOk: () => setSuperAdminTo(us),
        onClickClose: () => {
          dispatch(updateConfirmModal(null));
        },
      })
    );
  };

  const askToTransfer = () => {
    const target = selected;
    if (!target) {
      return;
    }
    dispatch(
      updateConfirmModal({
        title: { token: 'transferSuperAdminDev' },
        i18nMessage: { token: 'transferSuperAdminConfirmDev' },
        okText: { token: 'transferSuperAdminDev' },
        okTheme: SessionButtonColor.Danger,
        onClickOk: () => setSuperAdminTo(target),
        onClickClose: () => {
          dispatch(updateConfirmModal(null));
        },
      })
    );
  };

  const askToKick = () => {
    dispatch(
      updateConfirmModal({
        title: { token: 'kickAdminDev' },
        i18nMessage: { token: 'kickAdminConfirmDev' },
        okText: { token: 'kickAdminDev' },
        okTheme: SessionButtonColor.Danger,
        onClickOk: kickSelectedAdmin,
        onClickClose: () => {
          dispatch(updateConfirmModal(null));
        },
      })
    );
  };

  return (
    <SessionWrapperModal
      modalId="manageGroupAdminsModal"
      modalDataTestId="manage-group-admins-dialog"
      headerChildren={<ModalBasicHeader title={tr('manageAdminsDev')} showExitIcon={true} />}
      onClose={closeDialog}
      $contentMinWidth={WrapperModalWidth.wide}
      $contentMaxWidth={WrapperModalWidth.wide}
      buttonChildren={
        // the default 300px cap clips "Transfer super admin"; let the row use the modal
        <ModalActionsContainer
          buttonType={SessionButtonType.Simple}
          maxWidth="100%"
          style={{ flexWrap: 'wrap' }}
        >
          {canClaim ? (
            <SessionButton
              text={tr('claimSuperAdminDev')}
              buttonType={SessionButtonType.Simple}
              disabled={isProcessingUIChange}
              onClick={askToClaim}
              dataTestId="claim-super-admin-button"
            />
          ) : null}
          {weAreSuperAdmin ? (
            <>
              <SessionButton
                text={tr('transferSuperAdminDev')}
                buttonType={SessionButtonType.Simple}
                disabled={isProcessingUIChange || !anAdminIsPicked}
                onClick={askToTransfer}
                dataTestId="transfer-super-admin-button"
              />
              <SessionButton
                text={tr('kickAdminDev')}
                buttonType={SessionButtonType.Simple}
                buttonColor={SessionButtonColor.Danger}
                disabled={isProcessingUIChange || !anAdminIsPicked}
                onClick={askToKick}
                dataTestId="kick-admin-button"
              />
            </>
          ) : null}
          <SessionButton
            text={tr('cancel')}
            buttonType={SessionButtonType.Simple}
            onClick={closeDialog}
            dataTestId="session-confirm-cancel-button"
          />
        </ModalActionsContainer>
      }
    >
      <StyledSuperAdminLabel data-testid="super-admin-label">
        {!superAdminId
          ? tr('superAdminNoneDev')
          : weAreSuperAdmin
            ? tr('superAdminYouDev')
            : `${tr('superAdminIsDev')} ${superAdminName}`}
      </StyledSuperAdminLabel>
      <SpacerSM />
      <StyledDescription>{tr('manageAdminsDescriptionDev')}</StyledDescription>
      <SpacerSM />
      <StyledContactListInModal>
        <StyledSectionLabel>{tr('groupAdminsSectionDev')}</StyledSectionLabel>
        {admins.map(member => (
          <MemberListItem
            key={`admin-${member.pubkeyHex}`}
            pubkey={member.pubkeyHex}
            isSelected={selected === member.pubkeyHex}
            onSelect={() => setSelected(member.pubkeyHex === us ? null : member.pubkeyHex)}
            onUnselect={() => setSelected(null)}
            isAdmin={true}
            hideRadioButton={!weAreSuperAdmin || member.pubkeyHex === us}
            disableBg={true}
            displayGroupStatus={true}
            groupPk={conversationId}
            conversationId={conversationId}
          />
        ))}
        {plainMembers.length ? (
          <StyledSectionLabel>{tr('groupMembersSectionDev')}</StyledSectionLabel>
        ) : null}
        {plainMembers.map(member => (
          <MemberListItem
            key={`member-${member.pubkeyHex}`}
            pubkey={member.pubkeyHex}
            isSelected={false}
            hideRadioButton={true}
            disableBg={true}
            displayGroupStatus={true}
            groupPk={conversationId}
            conversationId={conversationId}
          />
        ))}
      </StyledContactListInModal>
      <SpacerSM />
      {weAreSuperAdmin && !anAdminIsPicked ? (
        <StyledHint>{tr('manageAdminsSelectHintDev')}</StyledHint>
      ) : null}
      <SpacerLG />
      <SessionSpinner $loading={isProcessingUIChange} />
      <SpacerLG />
    </SessionWrapperModal>
  );
};
